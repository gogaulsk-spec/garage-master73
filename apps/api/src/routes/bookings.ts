import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createNotification } from "../lib/notifications.js";

type AuthPayload = { sub: number; role: "ADMIN" | "MASTER" | "USER" };

async function requireAuth(req: any, reply: any): Promise<AuthPayload | null> {
  try {
    const p = (await req.jwtVerify()) as AuthPayload;
    return p;
  } catch {
    reply.code(401).send({ ok: false, error: "Не авторизован" });
    return null;
  }
}

const statusLabels: Record<string, string> = {
  NEW: "Новая",
  CONFIRMED: "Подтверждена",
  IN_PROGRESS: "В работе",
  CANCELLED: "Отменена",
  DONE: "Выполнена",
};

async function recalcMasterRating(app: FastifyInstance, garageId: number) {
  const garage = await app.db.get<{ master_user_id: number }>("SELECT master_user_id FROM garages WHERE id=?", [garageId]);
  if (!garage) return;
  const rating = await app.db.get<{ avg: string | number | null; count: string | number }>(
    `
      SELECT AVG(r.rating) as avg, COUNT(r.id) as count
      FROM reviews r
      JOIN garages g ON g.id = r.garage_id
      WHERE g.master_user_id = ?
    `,
    [garage.master_user_id]
  );
  await app.db.run("UPDATE master_profiles SET rating_avg=?, rating_count=? WHERE user_id=?", [
    rating?.avg ? Number(rating.avg) : 0,
    Number(rating?.count ?? 0),
    garage.master_user_id,
  ]);
}

export function registerBookingRoutes(app: FastifyInstance) {
  app.post("/api/bookings", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "USER") return reply.code(403).send({ ok: false, error: "Только для пользователей" });

    const body = z
      .object({
        garageId: z.number(),
        serviceId: z.number(),
        slotId: z.number(),
      })
      .parse(req.body);

    try {
      const res = await app.db.transaction(async (tx) => {
        const slot = await tx.get<any>(
          "SELECT id, garage_id, start_at, end_at, is_booked FROM availability_slots WHERE id=? AND garage_id=?",
          [body.slotId, body.garageId]
        );

        if (!slot) throw new Error("SLOT_NOT_FOUND");
        if (Number(slot.is_booked) === 1) throw new Error("SLOT_TAKEN");

        const gs = await tx.get<any>("SELECT 1 as ok FROM garage_services WHERE garage_id=? AND service_id=?", [body.garageId, body.serviceId]);
        if (!gs?.ok) throw new Error("SERVICE_NOT_IN_GARAGE");

        const upd = await tx.run("UPDATE availability_slots SET is_booked=1 WHERE id=? AND is_booked=0", [body.slotId]);
        if (upd.changes !== 1) throw new Error("SLOT_TAKEN");

        const now = Date.now();
        const ins = await tx.run(
          "INSERT INTO bookings (user_id, garage_id, service_id, slot_start, slot_end, status, created_at) VALUES (?, ?, ?, ?, ?, 'NEW', ?) RETURNING id",
          [auth.sub, body.garageId, body.serviceId, slot.start_at, slot.end_at, now]
        );

        const bookingId = Number(ins.lastInsertRowid);
        await tx.run("INSERT INTO conversations (booking_id, created_at) VALUES (?, ?) RETURNING id", [bookingId, now]);
        return { bookingId };
      });

      const garage = await app.db.get<any>("SELECT title, master_user_id FROM garages WHERE id=?", [body.garageId]);
      if (garage) {
        await createNotification(app.db, Number(garage.master_user_id), "BOOKING", "Новая заявка", `Поступила новая заявка #${res.bookingId} в «${garage.title}».`, "/master");
      }

      return { ok: true, ...res };
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg === "SLOT_NOT_FOUND") return reply.code(400).send({ ok: false, error: "Слот не найден" });
      if (msg === "SLOT_TAKEN") return reply.code(400).send({ ok: false, error: "Слот уже занят" });
      if (msg === "SERVICE_NOT_IN_GARAGE") return reply.code(400).send({ ok: false, error: "Услуга не принадлежит гаражу" });
      return reply.code(500).send({ ok: false, error: "Ошибка сервера" });
    }
  });

  app.get("/api/bookings/my", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "USER") return reply.code(403).send({ ok: false, error: "Только для пользователей" });

    const rows = await app.db.all(
      `
        SELECT
          b.id, b.status, b.cancel_reason as "cancelReason", b.master_comment as "masterComment", b.status_updated_at as "statusUpdatedAt", b.slot_start as "slotStart", b.slot_end as "slotEnd", b.created_at as "createdAt",
          g.id as "garageId", g.title as "garageTitle", g.address as "garageAddress",
          s.name as "serviceName", s.category as "serviceCategory",
          r.id as "reviewId", r.rating as "reviewRating", r.text as "reviewText", r.created_at as "reviewCreatedAt"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        JOIN services s ON s.id=b.service_id
        LEFT JOIN reviews r ON r.booking_id=b.id
        WHERE b.user_id=?
        ORDER BY b.slot_start DESC
        LIMIT 200
      `,
      [auth.sub]
    );

    return { ok: true, bookings: rows };
  });

  app.get("/api/master/bookings", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "MASTER") return reply.code(403).send({ ok: false, error: "Только для мастеров" });

    const rows = await app.db.all(
      `
        SELECT
          b.id, b.status, b.cancel_reason as "cancelReason", b.master_comment as "masterComment", b.status_updated_at as "statusUpdatedAt", b.slot_start as "slotStart", b.slot_end as "slotEnd", b.created_at as "createdAt",
          g.id as "garageId", g.title as "garageTitle", g.address as "garageAddress",
          s.name as "serviceName", s.category as "serviceCategory",
          u.id as "userId", u.email as "userEmail", u.phone as "userPhone",
          COALESCE(up.display_name, '') as "userDisplayName",
          COALESCE(up.avatar_url, '') as "userAvatarUrl",
          COALESCE(up.car_info, '') as "userCarInfo"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        JOIN services s ON s.id=b.service_id
        JOIN users u ON u.id=b.user_id
        LEFT JOIN user_profiles up ON up.user_id=u.id
        WHERE g.master_user_id=?
        ORDER BY b.slot_start DESC
        LIMIT 200
      `,
      [auth.sub]
    );

    return { ok: true, bookings: rows };
  });

  app.patch("/api/master/bookings/:id/status", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "MASTER") return reply.code(403).send({ ok: false, error: "Только для мастеров" });

    const id = Number((req.params as any).id);
    const body = z.object({
      status: z.enum(["CONFIRMED", "IN_PROGRESS", "CANCELLED", "DONE"]),
      reason: z.string().trim().max(500).optional().default(""),
      comment: z.string().trim().max(500).optional().default(""),
    }).parse(req.body);

    const booking = await app.db.get<any>(
      `
        SELECT
          b.id, b.user_id, b.garage_id, b.status, b.slot_start, b.slot_end,
          g.title as "garageTitle"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        WHERE b.id=? AND g.master_user_id=?
      `,
      [id, auth.sub]
    );

    if (!booking) return reply.code(404).send({ ok: false, error: "Запись не найдена" });

    await app.db.transaction(async (tx) => {
      await tx.run("UPDATE bookings SET status=?, cancel_reason=?, master_comment=?, status_updated_at=? WHERE id=?", [body.status, body.status === "CANCELLED" ? body.reason : "", body.comment || "", Date.now(), id]);

      if (body.status === "CANCELLED") {
        await tx.run(
          "UPDATE availability_slots SET is_booked=0 WHERE garage_id=? AND start_at=? AND end_at=?",
          [booking.garage_id, booking.slot_start, booking.slot_end]
        );
      }

      if (body.status === "CONFIRMED" || body.status === "IN_PROGRESS" || body.status === "DONE") {
        await tx.run(
          "UPDATE availability_slots SET is_booked=1 WHERE garage_id=? AND start_at=? AND end_at=?",
          [booking.garage_id, booking.slot_start, booking.slot_end]
        );
      }
    });

    await createNotification(
      app.db,
      Number(booking.user_id),
      "BOOKING_STATUS",
      `Статус заявки #${id}: ${statusLabels[body.status]}`,
      body.status === "CANCELLED" && body.reason ? `Мастерская «${booking.garageTitle}» отменила заявку. Причина: ${body.reason}` : `Мастерская «${booking.garageTitle}» обновила статус вашей заявки.`,
      "/me"
    );

    return { ok: true };
  });

  app.post("/api/bookings/:id/review", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "USER") return reply.code(403).send({ ok: false, error: "Только для пользователей" });

    const id = Number((req.params as any).id);
    const body = z.object({ rating: z.coerce.number().int().min(1).max(5), text: z.string().trim().max(1000).optional().default("") }).parse(req.body);

    const booking = await app.db.get<any>(
      `
        SELECT b.id, b.user_id, b.garage_id, b.status, g.title as "garageTitle", g.master_user_id
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        WHERE b.id=? AND b.user_id=?
      `,
      [id, auth.sub]
    );

    if (!booking) return reply.code(404).send({ ok: false, error: "Заявка не найдена" });
    if (booking.status !== "DONE") return reply.code(400).send({ ok: false, error: "Отзыв можно оставить только после выполненной заявки" });

    const existingReview = await app.db.get<{ id: number }>("SELECT id FROM reviews WHERE booking_id=?", [id]);
    if (existingReview) return reply.code(400).send({ ok: false, error: "Отзыв по этой заявке уже существует" });

    try {
      const result = await app.db.run(
        "INSERT INTO reviews (booking_id, user_id, garage_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        [id, auth.sub, booking.garage_id, body.rating, body.text, Date.now()]
      );
      await recalcMasterRating(app, Number(booking.garage_id));
      await createNotification(
        app.db,
        Number(booking.master_user_id),
        "REVIEW",
        "Новый отзыв",
        `Клиент оставил оценку ${body.rating}/5 для «${booking.garageTitle}».`,
        `/garage/${booking.garage_id}`
      );
      return { ok: true, reviewId: result.lastInsertRowid };
    } catch {
      return reply.code(400).send({ ok: false, error: "Отзыв по этой заявке уже существует" });
    }
  });



  app.get("/api/reviews/my", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "USER") return reply.code(403).send({ ok: false, error: "Только для пользователей" });

    const pending = await app.db.all(
      `
        SELECT
          b.id as "bookingId", b.slot_start as "slotStart", b.slot_end as "slotEnd",
          g.id as "garageId", g.title as "garageTitle",
          s.name as "serviceName"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        JOIN services s ON s.id=b.service_id
        LEFT JOIN reviews r ON r.booking_id=b.id
        WHERE b.user_id=? AND b.status='DONE' AND r.id IS NULL
        ORDER BY b.slot_start DESC
      `,
      [auth.sub]
    );

    const reviews = await app.db.all(
      `
        SELECT
          r.id, r.rating, r.text, r.created_at as "createdAt", rr.text as "replyText", rr.updated_at as "replyUpdatedAt",
          b.id as "bookingId", g.id as "garageId", g.title as "garageTitle", s.name as "serviceName"
        FROM reviews r
        LEFT JOIN review_replies rr ON rr.review_id=r.id
        JOIN bookings b ON b.id=r.booking_id
        JOIN garages g ON g.id=r.garage_id
        JOIN services s ON s.id=b.service_id
        WHERE r.user_id=?
        ORDER BY r.created_at DESC
      `,
      [auth.sub]
    );

    return { ok: true, pending, reviews };
  });


  app.get("/api/master/reviews", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "MASTER") return reply.code(403).send({ ok: false, error: "Только для мастеров" });

    const reviews = await app.db.all(
      `
        SELECT
          r.id, r.rating, r.text, r.created_at as "createdAt",
          rr.text as "replyText", rr.updated_at as "replyUpdatedAt",
          g.id as "garageId", g.title as "garageTitle",
          u.id as "userId", u.email as "userEmail",
          COALESCE(up.display_name, '') as "userDisplayName",
          COALESCE(up.avatar_url, '') as "userAvatarUrl",
          COALESCE(up.car_info, '') as "userCarInfo"
        FROM reviews r
        JOIN garages g ON g.id=r.garage_id
        JOIN users u ON u.id=r.user_id
        LEFT JOIN user_profiles up ON up.user_id=u.id
        LEFT JOIN review_replies rr ON rr.review_id=r.id
        WHERE g.master_user_id=?
        ORDER BY r.created_at DESC
        LIMIT 200
      `,
      [auth.sub]
    );
    return { ok: true, reviews };
  });

  app.patch("/api/master/reviews/:id/reply", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "MASTER") return reply.code(403).send({ ok: false, error: "Только для мастеров" });

    const id = Number((req.params as any).id);
    const body = z.object({ text: z.string().trim().min(2, "Ответ должен быть не короче 2 символов").max(1000) }).parse(req.body ?? {});
    const review = await app.db.get<any>(
      `
        SELECT r.id, r.user_id, r.garage_id, g.title as "garageTitle"
        FROM reviews r
        JOIN garages g ON g.id=r.garage_id
        WHERE r.id=? AND g.master_user_id=?
      `,
      [id, auth.sub]
    );
    if (!review) return reply.code(404).send({ ok: false, error: "Отзыв не найден" });
    const now = Date.now();
    await app.db.run(
      `
        INSERT INTO review_replies (review_id, master_user_id, text, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (review_id) DO UPDATE SET text=EXCLUDED.text, updated_at=EXCLUDED.updated_at
      `,
      [id, auth.sub, body.text, now, now]
    );
    await createNotification(app.db, Number(review.user_id), "REVIEW", "Мастер ответил на отзыв", `Мастерская «${review.garageTitle}» ответила на ваш отзыв.`, `/garage/${review.garage_id}`);
    return { ok: true };
  });


  app.get("/api/admin/bookings", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "ADMIN") return reply.code(403).send({ ok: false, error: "Только для администратора" });
    const rows = await app.db.all(
      `
        SELECT
          b.id, b.status, b.cancel_reason as "cancelReason", b.master_comment as "masterComment", b.status_updated_at as "statusUpdatedAt",
          b.slot_start as "slotStart", b.slot_end as "slotEnd", b.created_at as "createdAt",
          g.id as "garageId", g.title as "garageTitle", s.name as "serviceName",
          u.email as "userEmail", COALESCE(up.display_name, '') as "userDisplayName",
          mp.display_name as "masterName"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        JOIN services s ON s.id=b.service_id
        JOIN users u ON u.id=b.user_id
        LEFT JOIN user_profiles up ON up.user_id=u.id
        LEFT JOIN master_profiles mp ON mp.user_id=g.master_user_id
        ORDER BY b.created_at DESC
        LIMIT 300
      `
    );
    return { ok: true, bookings: rows };
  });

  app.get("/api/admin/users", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "ADMIN") return reply.code(403).send({ ok: false, error: "Только для администратора" });
    const rows = await app.db.all(
      `
        SELECT u.id, u.role, u.email, u.phone, u.created_at as "createdAt",
          COALESCE(up.display_name, mp.display_name, '') as "displayName",
          COALESCE(up.city, mp.city, '') as city,
          COALESCE(up.avatar_url, mp.avatar_url, '') as "avatarUrl"
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id=u.id
        LEFT JOIN master_profiles mp ON mp.user_id=u.id
        ORDER BY u.created_at DESC
        LIMIT 300
      `
    );
    return { ok: true, users: rows };
  });

  app.delete("/api/admin/users/:id", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "ADMIN") return reply.code(403).send({ ok: false, error: "Только для администратора" });

    const id = z.coerce.number().int().positive().parse((req.params as any).id);
    if (id === Number(auth.sub)) return reply.code(400).send({ ok: false, error: "Нельзя удалить текущий аккаунт администратора" });

    const user = await app.db.get<any>("SELECT id, role, email FROM users WHERE id=?", [id]);
    if (!user) return reply.code(404).send({ ok: false, error: "Пользователь не найден" });
    if (user.role === "ADMIN") return reply.code(400).send({ ok: false, error: "Администраторов нельзя удалять из интерфейса" });

    const result = await app.db.transaction(async (tx) => {
      const counts = {
        garages: Number((await tx.get<{ c: string | number }>("SELECT COUNT(1) as c FROM garages WHERE master_user_id=?", [id]))?.c ?? 0),
        bookings: Number((await tx.get<{ c: string | number }>("SELECT COUNT(1) as c FROM bookings b WHERE b.user_id=? OR b.garage_id IN (SELECT id FROM garages WHERE master_user_id=?)", [id, id]))?.c ?? 0),
        reviews: Number((await tx.get<{ c: string | number }>("SELECT COUNT(1) as c FROM reviews r WHERE r.user_id=? OR r.garage_id IN (SELECT id FROM garages WHERE master_user_id=?)", [id, id]))?.c ?? 0),
      };

      await tx.run("DELETE FROM messages WHERE from_user_id=? OR conversation_id IN (SELECT c.id FROM conversations c JOIN bookings b ON b.id=c.booking_id WHERE b.user_id=? OR b.garage_id IN (SELECT id FROM garages WHERE master_user_id=?))", [id, id, id]);
      await tx.run("DELETE FROM conversations WHERE booking_id IN (SELECT b.id FROM bookings b WHERE b.user_id=? OR b.garage_id IN (SELECT id FROM garages WHERE master_user_id=?))", [id, id]);
      await tx.run("DELETE FROM logbook_entries WHERE user_id=? OR booking_id IN (SELECT b.id FROM bookings b WHERE b.user_id=? OR b.garage_id IN (SELECT id FROM garages WHERE master_user_id=?))", [id, id, id]);
      await tx.run("DELETE FROM review_replies WHERE master_user_id=? OR review_id IN (SELECT r.id FROM reviews r WHERE r.user_id=? OR r.garage_id IN (SELECT id FROM garages WHERE master_user_id=?))", [id, id, id]);
      await tx.run("DELETE FROM reviews WHERE user_id=? OR garage_id IN (SELECT id FROM garages WHERE master_user_id=?)", [id, id]);
      await tx.run("DELETE FROM favorite_garages WHERE user_id=? OR garage_id IN (SELECT id FROM garages WHERE master_user_id=?)", [id, id]);
      await tx.run("DELETE FROM notifications WHERE user_id=?", [id]);
      await tx.run("DELETE FROM support_tickets WHERE user_id=?", [id]);
      await tx.run("DELETE FROM bookings WHERE user_id=? OR garage_id IN (SELECT id FROM garages WHERE master_user_id=?)", [id, id]);
      await tx.run("DELETE FROM availability_slots WHERE garage_id IN (SELECT id FROM garages WHERE master_user_id=?)", [id]);
      await tx.run("DELETE FROM garage_services WHERE garage_id IN (SELECT id FROM garages WHERE master_user_id=?)", [id]);
      await tx.run("DELETE FROM garages WHERE master_user_id=?", [id]);
      await tx.run("DELETE FROM master_profiles WHERE user_id=?", [id]);
      await tx.run("DELETE FROM user_profiles WHERE user_id=?", [id]);
      await tx.run("DELETE FROM users WHERE id=?", [id]);

      return counts;
    });

    return { ok: true, removed: result, deletedUser: { id, email: user.email, role: user.role } };
  });

  app.get("/api/admin/reviews", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "ADMIN") return reply.code(403).send({ ok: false, error: "Только для администратора" });
    const rows = await app.db.all(
      `
        SELECT r.id, r.rating, r.text, r.created_at as "createdAt",
          g.id as "garageId", g.title as "garageTitle",
          u.email as "userEmail", COALESCE(up.display_name, '') as "userDisplayName",
          rr.text as "replyText"
        FROM reviews r
        JOIN garages g ON g.id=r.garage_id
        JOIN users u ON u.id=r.user_id
        LEFT JOIN user_profiles up ON up.user_id=u.id
        LEFT JOIN review_replies rr ON rr.review_id=r.id
        ORDER BY r.created_at DESC
        LIMIT 300
      `
    );
    return { ok: true, reviews: rows };
  });

  app.get("/api/notifications", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;

    const notifications = await app.db.all(
      `
        SELECT id, type, title, text, link, read_at as "readAt", created_at as "createdAt"
        FROM notifications
        WHERE user_id=?
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [auth.sub]
    );
    const unread = await app.db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM notifications WHERE user_id=? AND read_at IS NULL", [auth.sub]);
    return { ok: true, notifications, unreadCount: Number(unread?.c ?? 0) };
  });

  app.patch("/api/notifications/read", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const body = z.object({ notificationId: z.coerce.number().int().positive().optional() }).parse(req.body ?? {});
    if (body.notificationId) {
      await app.db.run("UPDATE notifications SET read_at=? WHERE id=? AND user_id=?", [Date.now(), body.notificationId, auth.sub]);
    } else {
      await app.db.run("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL", [Date.now(), auth.sub]);
    }
    return { ok: true };
  });
}
