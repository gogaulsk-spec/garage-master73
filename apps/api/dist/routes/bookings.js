import { z } from "zod";
import { createNotification } from "../lib/notifications.js";
async function requireAuth(req, reply) {
    try {
        const p = (await req.jwtVerify());
        return p;
    }
    catch {
        reply.code(401).send({ ok: false, error: "Не авторизован" });
        return null;
    }
}
const statusLabels = {
    NEW: "Новая",
    CONFIRMED: "Подтверждена",
    CANCELLED: "Отменена",
    DONE: "Выполнена",
};
async function recalcMasterRating(app, garageId) {
    const garage = await app.db.get("SELECT master_user_id FROM garages WHERE id=?", [garageId]);
    if (!garage)
        return;
    const rating = await app.db.get(`
      SELECT AVG(r.rating) as avg, COUNT(r.id) as count
      FROM reviews r
      JOIN garages g ON g.id = r.garage_id
      WHERE g.master_user_id = ?
    `, [garage.master_user_id]);
    await app.db.run("UPDATE master_profiles SET rating_avg=?, rating_count=? WHERE user_id=?", [
        rating?.avg ? Number(rating.avg) : 0,
        Number(rating?.count ?? 0),
        garage.master_user_id,
    ]);
}
export function registerBookingRoutes(app) {
    app.post("/api/bookings", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "USER")
            return reply.code(403).send({ ok: false, error: "Только для пользователей" });
        const body = z
            .object({
            garageId: z.number(),
            serviceId: z.number(),
            slotId: z.number(),
        })
            .parse(req.body);
        try {
            const res = await app.db.transaction(async (tx) => {
                const slot = await tx.get("SELECT id, garage_id, start_at, end_at, is_booked FROM availability_slots WHERE id=? AND garage_id=?", [body.slotId, body.garageId]);
                if (!slot)
                    throw new Error("SLOT_NOT_FOUND");
                if (Number(slot.is_booked) === 1)
                    throw new Error("SLOT_TAKEN");
                const gs = await tx.get("SELECT 1 as ok FROM garage_services WHERE garage_id=? AND service_id=?", [body.garageId, body.serviceId]);
                if (!gs?.ok)
                    throw new Error("SERVICE_NOT_IN_GARAGE");
                const upd = await tx.run("UPDATE availability_slots SET is_booked=1 WHERE id=? AND is_booked=0", [body.slotId]);
                if (upd.changes !== 1)
                    throw new Error("SLOT_TAKEN");
                const now = Date.now();
                const ins = await tx.run("INSERT INTO bookings (user_id, garage_id, service_id, slot_start, slot_end, status, created_at) VALUES (?, ?, ?, ?, ?, 'NEW', ?) RETURNING id", [auth.sub, body.garageId, body.serviceId, slot.start_at, slot.end_at, now]);
                const bookingId = Number(ins.lastInsertRowid);
                await tx.run("INSERT INTO conversations (booking_id, created_at) VALUES (?, ?) RETURNING id", [bookingId, now]);
                return { bookingId };
            });
            const garage = await app.db.get("SELECT title, master_user_id FROM garages WHERE id=?", [body.garageId]);
            if (garage) {
                await createNotification(app.db, Number(garage.master_user_id), "BOOKING", "Новая заявка", `Поступила новая заявка #${res.bookingId} в «${garage.title}».`, "/master");
            }
            return { ok: true, ...res };
        }
        catch (e) {
            const msg = String(e?.message ?? "");
            if (msg === "SLOT_NOT_FOUND")
                return reply.code(400).send({ ok: false, error: "Слот не найден" });
            if (msg === "SLOT_TAKEN")
                return reply.code(400).send({ ok: false, error: "Слот уже занят" });
            if (msg === "SERVICE_NOT_IN_GARAGE")
                return reply.code(400).send({ ok: false, error: "Услуга не принадлежит гаражу" });
            return reply.code(500).send({ ok: false, error: "Ошибка сервера" });
        }
    });
    app.get("/api/bookings/my", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "USER")
            return reply.code(403).send({ ok: false, error: "Только для пользователей" });
        const rows = await app.db.all(`
        SELECT
          b.id, b.status, b.slot_start as "slotStart", b.slot_end as "slotEnd", b.created_at as "createdAt",
          g.id as "garageId", g.title as "garageTitle", g.address as "garageAddress",
          s.name as "serviceName", s.category as "serviceCategory",
          r.id as "reviewId", r.rating as "reviewRating", r.text as "reviewText"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        JOIN services s ON s.id=b.service_id
        LEFT JOIN reviews r ON r.booking_id=b.id
        WHERE b.user_id=?
        ORDER BY b.slot_start DESC
        LIMIT 200
      `, [auth.sub]);
        return { ok: true, bookings: rows };
    });
    app.get("/api/master/bookings", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "MASTER")
            return reply.code(403).send({ ok: false, error: "Только для мастеров" });
        const rows = await app.db.all(`
        SELECT
          b.id, b.status, b.slot_start as "slotStart", b.slot_end as "slotEnd", b.created_at as "createdAt",
          g.id as "garageId", g.title as "garageTitle", g.address as "garageAddress",
          s.name as "serviceName", s.category as "serviceCategory",
          u.email as "userEmail", u.phone as "userPhone"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        JOIN services s ON s.id=b.service_id
        JOIN users u ON u.id=b.user_id
        WHERE g.master_user_id=?
        ORDER BY b.slot_start DESC
        LIMIT 200
      `, [auth.sub]);
        return { ok: true, bookings: rows };
    });
    app.patch("/api/master/bookings/:id/status", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "MASTER")
            return reply.code(403).send({ ok: false, error: "Только для мастеров" });
        const id = Number(req.params.id);
        const body = z.object({ status: z.enum(["CONFIRMED", "CANCELLED", "DONE"]) }).parse(req.body);
        const booking = await app.db.get(`
        SELECT b.id, b.user_id, b.garage_id, g.title as "garageTitle"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        WHERE b.id=? AND g.master_user_id=?
      `, [id, auth.sub]);
        if (!booking)
            return reply.code(404).send({ ok: false, error: "Запись не найдена" });
        await app.db.run("UPDATE bookings SET status=? WHERE id=?", [body.status, id]);
        await createNotification(app.db, Number(booking.user_id), "BOOKING_STATUS", `Статус заявки #${id}: ${statusLabels[body.status]}`, `Мастерская «${booking.garageTitle}» обновила статус вашей заявки.`, "/me");
        return { ok: true };
    });
    app.post("/api/bookings/:id/review", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "USER")
            return reply.code(403).send({ ok: false, error: "Только для пользователей" });
        const id = Number(req.params.id);
        const body = z.object({ rating: z.coerce.number().int().min(1).max(5), text: z.string().trim().max(1000).optional().default("") }).parse(req.body);
        const booking = await app.db.get(`
        SELECT b.id, b.user_id, b.garage_id, b.status, g.title as "garageTitle", g.master_user_id
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        WHERE b.id=? AND b.user_id=?
      `, [id, auth.sub]);
        if (!booking)
            return reply.code(404).send({ ok: false, error: "Заявка не найдена" });
        if (booking.status !== "DONE")
            return reply.code(400).send({ ok: false, error: "Отзыв можно оставить только после выполненной заявки" });
        try {
            const result = await app.db.run("INSERT INTO reviews (booking_id, user_id, garage_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id", [id, auth.sub, booking.garage_id, body.rating, body.text, Date.now()]);
            await recalcMasterRating(app, Number(booking.garage_id));
            await createNotification(app.db, Number(booking.master_user_id), "REVIEW", "Новый отзыв", `Клиент оставил оценку ${body.rating}/5 для «${booking.garageTitle}».`, `/garage/${booking.garage_id}`);
            return { ok: true, reviewId: result.lastInsertRowid };
        }
        catch {
            return reply.code(400).send({ ok: false, error: "Отзыв по этой заявке уже существует" });
        }
    });
    app.get("/api/notifications", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        const notifications = await app.db.all(`
        SELECT id, type, title, text, link, read_at as "readAt", created_at as "createdAt"
        FROM notifications
        WHERE user_id=?
        ORDER BY created_at DESC
        LIMIT 50
      `, [auth.sub]);
        const unread = await app.db.get("SELECT COUNT(1) as c FROM notifications WHERE user_id=? AND read_at IS NULL", [auth.sub]);
        return { ok: true, notifications, unreadCount: Number(unread?.c ?? 0) };
    });
    app.patch("/api/notifications/read", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        const body = z.object({ notificationId: z.coerce.number().int().positive().optional() }).parse(req.body ?? {});
        if (body.notificationId) {
            await app.db.run("UPDATE notifications SET read_at=? WHERE id=? AND user_id=?", [Date.now(), body.notificationId, auth.sub]);
        }
        else {
            await app.db.run("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL", [Date.now(), auth.sub]);
        }
        return { ok: true };
    });
}
