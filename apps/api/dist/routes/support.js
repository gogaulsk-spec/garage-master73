import { z } from "zod";
import { createNotification } from "../lib/notifications.js";
async function requireAuth(req, reply) {
    try {
        return (await req.jwtVerify());
    }
    catch {
        reply.code(401).send({ ok: false, error: "Не авторизован" });
        return null;
    }
}
const ticketSchema = z.object({
    topic: z.string().trim().max(80).optional().default("Другое"),
    subject: z.string().trim().min(3, "Укажи тему обращения").max(120),
    message: z.string().trim().min(10, "Опиши проблему подробнее").max(2000),
});
export function registerSupportRoutes(app) {
    app.get("/api/support/my", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        const rows = await app.db.all(`
        SELECT id, topic, subject, message, status, admin_reply as "adminReply", created_at as "createdAt", updated_at as "updatedAt"
        FROM support_tickets
        WHERE user_id=?
        ORDER BY created_at DESC
        LIMIT 50
      `, [auth.sub]);
        return { ok: true, tickets: rows };
    });
    app.post("/api/support", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        const body = ticketSchema.parse(req.body ?? {});
        const now = Date.now();
        const res = await app.db.run("INSERT INTO support_tickets (user_id, role, topic, subject, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?) RETURNING id", [auth.sub, auth.role, body.topic, body.subject, body.message, now, now]);
        const admins = await app.db.all("SELECT id FROM users WHERE role='ADMIN'");
        await Promise.all(admins.map((admin) => createNotification(app.db, Number(admin.id), "SUPPORT", "Новое обращение в поддержку", body.subject, "/admin")));
        return { ok: true, ticketId: res.lastInsertRowid };
    });
    app.get("/api/admin/support", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "ADMIN")
            return reply.code(403).send({ ok: false, error: "Только для администратора" });
        const rows = await app.db.all(`
        SELECT st.id, st.topic, st.subject, st.message, st.status, st.admin_reply as "adminReply", st.created_at as "createdAt", st.updated_at as "updatedAt",
               u.email as "userEmail", u.role as "userRole", COALESCE(up.display_name, '') as "displayName"
        FROM support_tickets st
        LEFT JOIN users u ON u.id=st.user_id
        LEFT JOIN user_profiles up ON up.user_id=u.id
        ORDER BY CASE st.status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END, st.created_at DESC
        LIMIT 200
      `);
        return { ok: true, tickets: rows };
    });
    app.patch("/api/admin/support/:id", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "ADMIN")
            return reply.code(403).send({ ok: false, error: "Только для администратора" });
        const id = z.coerce.number().int().positive().parse(req.params.id);
        const body = z.object({
            status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]),
            adminReply: z.string().trim().max(2000).optional().default(""),
        }).parse(req.body ?? {});
        const ticket = await app.db.get("SELECT id, user_id, subject FROM support_tickets WHERE id=?", [id]);
        if (!ticket)
            return reply.code(404).send({ ok: false, error: "Обращение не найдено" });
        await app.db.run("UPDATE support_tickets SET status=?, admin_reply=?, updated_at=? WHERE id=?", [body.status, body.adminReply, Date.now(), id]);
        if (ticket.user_id) {
            await createNotification(app.db, Number(ticket.user_id), "SUPPORT", "Ответ поддержки", `По обращению «${ticket.subject}» обновлён статус.`, "/support");
        }
        return { ok: true };
    });
    app.get("/api/admin/stats", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "ADMIN")
            return reply.code(403).send({ ok: false, error: "Только для администратора" });
        const [users, masters, garages, pendingGarages, bookings, doneBookings, reviews, support, avgRating] = await Promise.all([
            app.db.get("SELECT COUNT(1) as c FROM users"),
            app.db.get("SELECT COUNT(1) as c FROM users WHERE role='MASTER'"),
            app.db.get("SELECT COUNT(1) as c FROM garages"),
            app.db.get("SELECT COUNT(1) as c FROM garages WHERE is_approved=0 AND COALESCE(moderation_reason, '')=''"),
            app.db.get("SELECT COUNT(1) as c FROM bookings"),
            app.db.get("SELECT COUNT(1) as c FROM bookings WHERE status='DONE'"),
            app.db.get("SELECT COUNT(1) as c FROM reviews"),
            app.db.get("SELECT COUNT(1) as c FROM support_tickets WHERE status <> 'CLOSED'"),
            app.db.get("SELECT AVG(rating) as v FROM reviews"),
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
