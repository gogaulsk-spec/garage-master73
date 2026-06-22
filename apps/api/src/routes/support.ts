import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createNotification } from "../lib/notifications.js";
import { hashPassword } from "../security/password.js";

type AuthPayload = { sub: number; role: "ADMIN" | "MASTER" | "USER" };

async function requireAuth(req: any, reply: any): Promise<AuthPayload | null> {
  try {
    return (await req.jwtVerify()) as AuthPayload;
  } catch {
    reply.code(401).send({ ok: false, error: "Не авторизован" });
    return null;
  }
}

const ticketSchema = z.object({
  topic: z.string().trim().max(80).optional().default("Другое"),
  subject: z.string().trim().min(3, "Укажи тему обращения").max(120),
  message: z.string().trim().min(10, "Опиши проблему подробнее").max(2000),
});

export function registerSupportRoutes(app: FastifyInstance) {
  app.get("/api/support/my", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const rows = await app.db.all(
      `
        SELECT id, topic, subject, message, status, admin_reply as "adminReply", created_at as "createdAt", updated_at as "updatedAt"
        FROM support_tickets
        WHERE user_id=?
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [auth.sub]
    );
    return { ok: true, tickets: rows };
  });

  app.post("/api/support", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const body = ticketSchema.parse(req.body ?? {});
    const now = Date.now();
    const res = await app.db.run(
      "INSERT INTO support_tickets (user_id, role, topic, subject, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?) RETURNING id",
      [auth.sub, auth.role, body.topic, body.subject, body.message, now, now]
    );
    const admins = await app.db.all<{ id: number }>("SELECT id FROM users WHERE role='ADMIN'");
    await Promise.all(admins.map((admin) => createNotification(app.db, Number(admin.id), "SUPPORT", "Новое обращение в поддержку", body.subject, "/admin/support")));
    return { ok: true, ticketId: res.lastInsertRowid };
  });

  app.get("/api/admin/support", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "ADMIN") return reply.code(403).send({ ok: false, error: "Только для администратора" });
    const rows = await app.db.all(
      `
        SELECT st.id, st.topic, st.subject, st.message, st.status, st.admin_reply as "adminReply", st.created_at as "createdAt", st.updated_at as "updatedAt",
               u.email as "userEmail", u.role as "userRole", COALESCE(up.display_name, '') as "displayName"
        FROM support_tickets st
        LEFT JOIN users u ON u.id=st.user_id
        LEFT JOIN user_profiles up ON up.user_id=u.id
        ORDER BY CASE st.status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END, st.created_at DESC
        LIMIT 200
      `
    );
    return { ok: true, tickets: rows };
  });

  app.patch("/api/admin/support/:id", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "ADMIN") return reply.code(403).send({ ok: false, error: "Только для администратора" });
    const id = z.coerce.number().int().positive().parse((req.params as any).id);
    const body = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]),
      adminReply: z.string().trim().max(2000).optional().default(""),
    }).parse(req.body ?? {});
    const ticket = await app.db.get<any>("SELECT id, user_id, subject FROM support_tickets WHERE id=?", [id]);
    if (!ticket) return reply.code(404).send({ ok: false, error: "Обращение не найдено" });
    await app.db.run("UPDATE support_tickets SET status=?, admin_reply=?, updated_at=? WHERE id=?", [body.status, body.adminReply, Date.now(), id]);
    if (ticket.user_id) {
      await createNotification(app.db, Number(ticket.user_id), "SUPPORT", "Ответ поддержки", `По обращению «${ticket.subject}» обновлён статус.`, "/support");
    }
    return { ok: true };
  });


  app.post("/api/admin/reset-clean", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "ADMIN") return reply.code(403).send({ ok: false, error: "Только для администратора" });

    const body = z.object({
      confirm: z.literal("RESET_GARAGE_MASTER"),
    }).parse(req.body ?? {});

    const keepEmails = ["admin@example.com", "master@example.com", "user@example.com"];
    const now = Date.now();
    const adminHash = hashPassword("admin123");
    const masterHash = hashPassword("master123");
    const userHash = hashPassword("user123");

    const result = await app.db.transaction(async (tx) => {
      const before = {
        garages: Number((await tx.get<{ c: string | number }>("SELECT COUNT(1) as c FROM garages"))?.c ?? 0),
        bookings: Number((await tx.get<{ c: string | number }>("SELECT COUNT(1) as c FROM bookings"))?.c ?? 0),
        reviews: Number((await tx.get<{ c: string | number }>("SELECT COUNT(1) as c FROM reviews"))?.c ?? 0),
        users: Number((await tx.get<{ c: string | number }>("SELECT COUNT(1) as c FROM users WHERE email NOT IN (?, ?, ?)", keepEmails))?.c ?? 0),
      };

      await tx.run("DELETE FROM review_replies");
      await tx.run("DELETE FROM reviews");
      await tx.run("DELETE FROM messages");
      await tx.run("DELETE FROM conversations");
      await tx.run("DELETE FROM favorite_garages");
      await tx.run("DELETE FROM notifications");
      await tx.run("DELETE FROM support_tickets");
      await tx.run("DELETE FROM logbook_entries");
      await tx.run("DELETE FROM bookings");
      await tx.run("DELETE FROM availability_slots");
      await tx.run("DELETE FROM garage_services");
      await tx.run("DELETE FROM garages");

      await tx.run("DELETE FROM master_profiles WHERE user_id NOT IN (SELECT id FROM users WHERE email IN (?, ?, ?))", keepEmails);
      await tx.run("DELETE FROM user_profiles WHERE user_id NOT IN (SELECT id FROM users WHERE email IN (?, ?, ?))", keepEmails);
      await tx.run("DELETE FROM users WHERE email NOT IN (?, ?, ?)", keepEmails);

      await tx.run(
        `
          INSERT INTO users (role, email, password_hash, personal_data_agreed, personal_data_agreed_at, created_at)
          VALUES ('ADMIN', ?, ?, 1, ?, ?)
          ON CONFLICT (email) DO UPDATE SET role='ADMIN', password_hash=EXCLUDED.password_hash, personal_data_agreed=1, personal_data_agreed_at=EXCLUDED.personal_data_agreed_at
        `,
        ["admin@example.com", adminHash, now, now]
      );
      await tx.run(
        `
          INSERT INTO users (role, email, password_hash, personal_data_agreed, personal_data_agreed_at, created_at)
          VALUES ('MASTER', ?, ?, 1, ?, ?)
          ON CONFLICT (email) DO UPDATE SET role='MASTER', password_hash=EXCLUDED.password_hash, personal_data_agreed=1, personal_data_agreed_at=EXCLUDED.personal_data_agreed_at
        `,
        ["master@example.com", masterHash, now, now]
      );
      await tx.run(
        `
          INSERT INTO users (role, email, password_hash, personal_data_agreed, personal_data_agreed_at, created_at)
          VALUES ('USER', ?, ?, 1, ?, ?)
          ON CONFLICT (email) DO UPDATE SET role='USER', password_hash=EXCLUDED.password_hash, personal_data_agreed=1, personal_data_agreed_at=EXCLUDED.personal_data_agreed_at
        `,
        ["user@example.com", userHash, now, now]
      );

      const admin = await tx.get<{ id: number }>("SELECT id FROM users WHERE email=?", ["admin@example.com"]);
      const master = await tx.get<{ id: number }>("SELECT id FROM users WHERE email=?", ["master@example.com"]);
      const user = await tx.get<{ id: number }>("SELECT id FROM users WHERE email=?", ["user@example.com"]);

      if (admin) {
        await tx.run(
          `
            INSERT INTO user_profiles (user_id, display_name, about, avatar_url, city, car_info, updated_at)
            VALUES (?, 'Администратор', 'Управляет модерацией, пользователями, заявками и поддержкой GarageMaster.', '', 'Ульяновск', '', ?)
            ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, about=EXCLUDED.about, updated_at=EXCLUDED.updated_at
          `,
          [Number(admin.id), now]
        );
      }
      if (master) {
        await tx.run(
          `
            INSERT INTO user_profiles (user_id, display_name, about, avatar_url, city, car_info, updated_at)
            VALUES (?, 'Иван Сафонов', 'Тестовый мастер. Можно создать новую карточку гаража и проверить работу заявок.', '/images/master-ivan.jpg', 'Ульяновск', '', ?)
            ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, about=EXCLUDED.about, avatar_url=EXCLUDED.avatar_url, city=EXCLUDED.city, updated_at=EXCLUDED.updated_at
          `,
          [Number(master.id), now]
        );
        await tx.run(
          `
            INSERT INTO master_profiles (user_id, display_name, about, avatar_url, rating_avg, rating_count)
            VALUES (?, 'Иван Сафонов', 'Тестовый мастер для проверки создания гаража, расписания, заявок и отзывов.', '/images/master-ivan.jpg', 0, 0)
            ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, about=EXCLUDED.about, avatar_url=EXCLUDED.avatar_url, rating_avg=0, rating_count=0
          `,
          [Number(master.id)]
        );
      }
      if (user) {
        await tx.run(
          `
            INSERT INTO user_profiles (user_id, display_name, about, avatar_url, city, car_info, updated_at)
            VALUES (?, 'Алексей', 'Тестовый пользователь для проверки записи к мастеру и отзывов.', '/images/master-sergey.jpg', 'Ульяновск', 'Lada Priora 2012', ?)
            ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, about=EXCLUDED.about, avatar_url=EXCLUDED.avatar_url, city=EXCLUDED.city, car_info=EXCLUDED.car_info, updated_at=EXCLUDED.updated_at
          `,
          [Number(user.id), now]
        );
      }

      const resetSequences = ["garages", "availability_slots", "bookings", "reviews", "notifications", "support_tickets", "logbook_entries", "messages", "conversations"];
      for (const table of resetSequences) {
        await tx.run(`SELECT setval(pg_get_serial_sequence('${table}','id'), 1, false)`);
      }
      await tx.run("SELECT setval(pg_get_serial_sequence('users','id'), COALESCE((SELECT MAX(id) FROM users), 1), true)");

      return before;
    });

    return { ok: true, removed: result, kept: keepEmails };
  });

  app.get("/api/admin/stats", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "ADMIN") return reply.code(403).send({ ok: false, error: "Только для администратора" });
    const [users, masters, garages, pendingGarages, bookings, doneBookings, reviews, support, avgRating] = await Promise.all([
      app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM users"),
      app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM users WHERE role='MASTER'"),
      app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM garages"),
      app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM garages WHERE is_approved=0 AND COALESCE(moderation_reason, '')=''"),
      app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM bookings"),
      app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM bookings WHERE status='DONE'"),
      app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM reviews"),
      app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM support_tickets WHERE status <> 'CLOSED'"),
      app.db.get<{ v: string | number | null }>("SELECT AVG(rating) as v FROM reviews"),
    ]);
    return {
      ok: true,
      stats: {
        users: Number(users?.c ?? 0),
        masters: Number(masters?.c ?? 0),
        garages: Number(garages?.c ?? 0),
        pendingGarages: Number(pendingGarages?.c ?? 0),
        bookings: Number(bookings?.c ?? 0),
        doneBookings: Number(doneBookings?.c ?? 0),
        reviews: Number(reviews?.c ?? 0),
        openSupport: Number(support?.c ?? 0),
        avgRating: avgRating?.v ? Number(avgRating.v) : 0,
      },
    };
  });
}
