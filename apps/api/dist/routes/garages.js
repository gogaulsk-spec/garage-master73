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
const scheduleSchema = z.object({
    workSchedule: z.string().trim().max(200).optional().default("По записи"),
    daysAhead: z.coerce.number().int().min(1).max(60).default(14),
    startHour: z.coerce.number().int().min(0).max(23).default(10),
    endHour: z.coerce.number().int().min(1).max(24).default(18),
    slotDurationMin: z.coerce.number().int().min(30).max(240).default(60),
});
const masterGarageSchema = z.object({
    title: z.string().trim().min(3, "Название должно быть не короче 3 символов"),
    address: z.string().trim().min(5, "Укажи адрес"),
    description: z.string().trim().max(2000).default(""),
    phone: z.string().trim().max(50).optional().default(""),
    coverUrl: z.string().trim().max(2_500_000).optional().default(""),
    photoUrls: z.array(z.string().trim().max(2_500_000)).max(5, "Можно загрузить не больше 5 фото").optional().default([]),
    workSchedule: z.string().trim().max(200).optional().default(""),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    services: z
        .array(z.object({
        serviceId: z.coerce.number().int().positive(),
        priceFrom: z.coerce.number().int().min(0).optional(),
        durationMin: z.coerce.number().int().min(15).max(480).optional(),
    }))
        .min(1, "Добавь хотя бы одну услугу"),
    schedule: scheduleSchema.default({ daysAhead: 14, startHour: 10, endHour: 18, slotDurationMin: 60, workSchedule: "По записи" }),
});
function normalizeStartDay(ts = Date.now()) {
    const day = new Date(ts);
    day.setHours(0, 0, 0, 0);
    return day;
}
function parsePhotoUrls(value) {
    if (!value || typeof value !== "string")
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    }
    catch {
        return value.split("\n").map((x) => x.trim()).filter(Boolean);
    }
}
function normalizeGarageRow(row) {
    if (!row)
        return row;
    const photoUrls = parsePhotoUrls(row.photoUrls ?? row.photo_urls);
    return {
        ...row,
        coverUrl: row.coverUrl || row.cover_url || photoUrls[0] || "",
        photoUrls,
        workSchedule: row.workSchedule || row.work_schedule || "",
        moderationReason: row.moderationReason || row.moderation_reason || "",
        moderatedAt: row.moderatedAt || row.moderated_at || null,
        avatarUrl: row.avatarUrl || row.avatar_url || "",
        ratingAvg: Number(row.ratingAvg ?? row.rating_avg ?? 0),
        ratingCount: Number(row.ratingCount ?? row.rating_count ?? 0),
        minPrice: row.minPrice === null || row.minPrice === undefined ? null : Number(row.minPrice),
        servicesCount: Number(row.servicesCount ?? row.services_count ?? 0),
        futureSlotsCount: Number(row.futureSlotsCount ?? row.future_slots_count ?? 0),
        servicesList: row.servicesList ? String(row.servicesList).split(",").filter(Boolean) : [],
    };
}
async function geocodeAddress(address) {
    const clean = address.trim();
    if (clean.length < 5)
        return null;
    const defaultCity = process.env.GEOCODE_DEFAULT_CITY || "Ульяновск, Россия";
    const query = /ульяновск|ulyanovsk|россия|russia/i.test(clean) ? clean : `${clean}, ${defaultCity}`;
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("q", query);
    url.searchParams.set("addressdetails", "1");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "Accept-Language": "ru",
                "User-Agent": process.env.GEOCODE_USER_AGENT || "GarageMaster/1.0 (student demo project)",
            },
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        const first = data[0];
        if (!first?.lat || !first?.lon)
            return null;
        return {
            lat: Number(first.lat),
            lng: Number(first.lon),
            displayName: first.display_name || query,
            source: "OpenStreetMap Nominatim",
        };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
async function createSlots(db, garageId, opts) {
    const startDay = normalizeStartDay(Date.now());
    const existingRows = await db.all("SELECT start_at, end_at FROM availability_slots WHERE garage_id=? AND start_at >= ?", [garageId, startDay.getTime()]);
    const existing = new Set(existingRows.map((x) => `${Number(x.start_at)}-${Number(x.end_at)}`));
    let slotsCreated = 0;
    for (let d = 0; d < opts.daysAhead; d++) {
        const day = new Date(startDay.getTime() + d * 24 * 60 * 60 * 1000);
        const from = new Date(day);
        from.setHours(opts.startHour, 0, 0, 0);
        const to = new Date(day);
        to.setHours(opts.endHour, 0, 0, 0);
        for (let cursor = from.getTime(); cursor + opts.slotDurationMin * 60 * 1000 <= to.getTime(); cursor += opts.slotDurationMin * 60 * 1000) {
            const end = cursor + opts.slotDurationMin * 60 * 1000;
            const key = `${cursor}-${end}`;
            if (existing.has(key))
                continue;
            await db.run("INSERT INTO availability_slots (garage_id, start_at, end_at, is_booked) VALUES (?, ?, ?, 0) RETURNING id", [garageId, cursor, end]);
            existing.add(key);
            slotsCreated += 1;
        }
    }
    return slotsCreated;
}
export function registerGarageRoutes(app) {
    app.get("/api/services", async () => {
        const rows = await app.db.all("SELECT id, category, name FROM services ORDER BY category, name");
        return { ok: true, services: rows };
    });
    app.get("/api/geocode", async (req, reply) => {
        const q = z.object({ address: z.string().trim().min(5, "Укажи адрес") }).parse((req.query ?? {}));
        const result = await geocodeAddress(q.address);
        if (!result)
            return reply.code(404).send({ ok: false, error: "Не удалось найти координаты по адресу" });
        return { ok: true, ...result };
    });
    app.get("/api/garages", async (req) => {
        const q = z
            .object({
            search: z.string().trim().optional(),
            serviceId: z.coerce.number().int().positive().optional(),
            approved: z.coerce.number().optional(),
        })
            .parse((req.query ?? {}));
        let sql = `
      SELECT
        g.id,
        g.title,
        g.address,
        g.lat,
        g.lng,
        g.description,
        g.phone,
        g.cover_url as "coverUrl",
        g.photo_urls as "photoUrls",
        g.work_schedule as "workSchedule",
        g.is_approved,
        g.moderation_reason as "moderationReason",
        g.moderated_at as "moderatedAt",
        mp.display_name as "masterName",
        mp.about as "masterAbout",
        mp.avatar_url as "avatarUrl",
        mp.rating_avg as "ratingAvg",
        mp.rating_count as "ratingCount",
        MIN(gs.price_from) as "minPrice",
        STRING_AGG(DISTINCT s.name, ',') as "servicesList"
      FROM garages g
      JOIN master_profiles mp ON mp.user_id = g.master_user_id
      LEFT JOIN garage_services gs ON gs.garage_id = g.id
      LEFT JOIN services s ON s.id = gs.service_id
      WHERE 1=1
    `;
        const params = [];
        if (q.approved !== undefined) {
            sql += " AND g.is_approved = ?";
            params.push(q.approved);
        }
        if (q.search) {
            sql += `
        AND (
          g.title ILIKE ?
          OR g.address ILIKE ?
          OR g.description ILIKE ?
          OR mp.display_name ILIKE ?
          OR s.name ILIKE ?
          OR s.category ILIKE ?
        )
      `;
            const like = `%${q.search}%`;
            params.push(like, like, like, like, like, like);
        }
        if (q.serviceId) {
            sql += " AND EXISTS (SELECT 1 FROM garage_services x WHERE x.garage_id=g.id AND x.service_id=?)";
            params.push(q.serviceId);
        }
        sql += " GROUP BY g.id, mp.user_id ORDER BY g.is_approved DESC, mp.rating_avg DESC, mp.rating_count DESC, g.id DESC LIMIT 100";
        const rows = (await app.db.all(sql, params)).map(normalizeGarageRow);
        return { ok: true, garages: rows };
    });
    app.get("/api/master/garages", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "MASTER")
            return reply.code(403).send({ ok: false, error: "Только для мастеров" });
        const garages = (await app.db.all(`
        SELECT
          g.id, g.title, g.address, g.description, g.phone, g.lat, g.lng,
          g.cover_url as "coverUrl", g.photo_urls as "photoUrls", g.work_schedule as "workSchedule",
          g.is_approved,
          g.moderation_reason as "moderationReason", g.moderated_at as "moderatedAt",
          COUNT(DISTINCT gs.service_id) as "servicesCount",
          COUNT(DISTINCT CASE WHEN sl.start_at >= ? THEN sl.id END) as "futureSlotsCount"
        FROM garages g
        LEFT JOIN garage_services gs ON gs.garage_id = g.id
        LEFT JOIN availability_slots sl ON sl.garage_id = g.id
        WHERE g.master_user_id = ?
        GROUP BY g.id
        ORDER BY g.id DESC
      `, [Date.now(), auth.sub])).map(normalizeGarageRow);
        return { ok: true, garages };
    });
    app.post("/api/master/garages", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "MASTER")
            return reply.code(403).send({ ok: false, error: "Только для мастеров" });
        const body = masterGarageSchema.parse(req.body);
        if (body.schedule.endHour <= body.schedule.startHour) {
            return reply.code(400).send({ ok: false, error: "Время окончания должно быть больше времени начала" });
        }
        let resolvedLat = body.lat ?? null;
        let resolvedLng = body.lng ?? null;
        let geocodedAddress = null;
        if (resolvedLat === null || resolvedLng === null) {
            const found = await geocodeAddress(body.address);
            if (found) {
                resolvedLat = found.lat;
                resolvedLng = found.lng;
                geocodedAddress = found.displayName;
            }
        }
        const existing = new Set((await app.db.all("SELECT id FROM services")).map((x) => Number(x.id)));
        for (const item of body.services) {
            if (!existing.has(Number(item.serviceId))) {
                return reply.code(400).send({ ok: false, error: `Услуга #${item.serviceId} не найдена` });
            }
        }
        const result = await app.db.transaction(async (tx) => {
            const now = Date.now();
            const insGarage = await tx.run(`
          INSERT INTO garages
            (master_user_id, title, address, lat, lng, description, phone, cover_url, photo_urls, work_schedule, is_approved, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?) RETURNING id
        `, [
                auth.sub,
                body.title,
                body.address,
                resolvedLat,
                resolvedLng,
                body.description,
                body.phone || null,
                body.coverUrl || "/images/garage-lada-real.jpg",
                JSON.stringify(body.photoUrls?.length ? body.photoUrls : [body.coverUrl || "/images/garage-lada-real.jpg"]),
                body.workSchedule || "По записи",
                now,
            ]);
            const garageId = Number(insGarage.lastInsertRowid);
            for (const item of body.services) {
                await tx.run("INSERT INTO garage_services (garage_id, service_id, price_from, duration_min) VALUES (?, ?, ?, ?)", [garageId, item.serviceId, item.priceFrom ?? null, item.durationMin ?? body.schedule.slotDurationMin]);
            }
            const slotsCreated = await createSlots(tx, garageId, body.schedule);
            return { garageId, slotsCreated };
        });
        return { ok: true, garageId: result.garageId, slotsCreated: result.slotsCreated, geocodedAddress };
    });
    app.patch("/api/master/garages/:id/schedule", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "MASTER")
            return reply.code(403).send({ ok: false, error: "Только для мастеров" });
        const id = Number(req.params.id);
        const body = scheduleSchema.parse(req.body);
        if (body.endHour <= body.startHour) {
            return reply.code(400).send({ ok: false, error: "Время окончания должно быть больше времени начала" });
        }
        const garage = await app.db.get("SELECT id FROM garages WHERE id=? AND master_user_id=?", [id, auth.sub]);
        if (!garage)
            return reply.code(404).send({ ok: false, error: "Гараж не найден" });
        const result = await app.db.transaction(async (tx) => {
            const startDay = normalizeStartDay(Date.now()).getTime();
            await tx.run("UPDATE garages SET work_schedule=? WHERE id=?", [body.workSchedule || "По записи", id]);
            await tx.run("DELETE FROM availability_slots WHERE garage_id=? AND start_at >= ? AND is_booked=0", [id, startDay]);
            const slotsCreated = await createSlots(tx, id, body);
            return { slotsCreated };
        });
        return { ok: true, slotsCreated: result.slotsCreated };
    });
    app.get("/api/garages/:id", async (req, reply) => {
        const id = Number(req.params.id);
        const garage = normalizeGarageRow(await app.db.get(`
          SELECT
            g.id, g.title, g.address, g.lat, g.lng, g.description, g.phone,
            g.cover_url as "coverUrl", g.photo_urls as "photoUrls", g.work_schedule as "workSchedule",
            g.is_approved,
            g.moderation_reason as "moderationReason",
            g.moderated_at as "moderatedAt",
            mp.display_name as "masterName", mp.about as "masterAbout", mp.avatar_url as "avatarUrl",
            mp.rating_avg as "ratingAvg", mp.rating_count as "ratingCount"
          FROM garages g
          JOIN master_profiles mp ON mp.user_id=g.master_user_id
          WHERE g.id=?
        `, [id]));
        if (!garage)
            return reply.code(404).send({ ok: false, error: "Not found" });
        const services = await app.db.all(`
        SELECT s.id, s.category, s.name, gs.price_from as "priceFrom", gs.duration_min as "durationMin"
        FROM garage_services gs JOIN services s ON s.id=gs.service_id
        WHERE gs.garage_id=?
        ORDER BY s.category, s.name
      `, [id]);
        const slots = (await app.db.all(`
        SELECT id, start_at as "startAt", end_at as "endAt", is_booked as "isBooked"
        FROM availability_slots
        WHERE garage_id=? AND start_at >= ?
        ORDER BY start_at
        LIMIT 80
      `, [id, Date.now()])).map((slot) => ({ ...slot, isBooked: Number(slot.isBooked) === 1 }));
        const reviews = await app.db.all(`
        SELECT r.id, r.rating, r.text, r.created_at as "createdAt", u.email as "userEmail"
        FROM reviews r
        JOIN users u ON u.id=r.user_id
        WHERE r.garage_id=?
        ORDER BY r.created_at DESC
        LIMIT 20
      `, [id]);
        return { ok: true, garage, services, slots, reviews };
    });
    app.get("/api/admin/garages", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "ADMIN")
            return reply.code(403).send({ ok: false, error: "Только для администратора" });
        const rows = (await app.db.all(`
        SELECT
          g.id, g.title, g.address, g.description, g.phone,
          g.cover_url as "coverUrl", g.photo_urls as "photoUrls", g.work_schedule as "workSchedule",
          g.is_approved, g.created_at as "createdAt",
          g.moderation_reason as "moderationReason", g.moderated_at as "moderatedAt",
          mp.display_name as "masterName", mp.avatar_url as "avatarUrl",
          mp.rating_avg as "ratingAvg", mp.rating_count as "ratingCount",
          MIN(gs.price_from) as "minPrice",
          STRING_AGG(DISTINCT s.name, ',') as "servicesList"
        FROM garages g
        JOIN master_profiles mp ON mp.user_id = g.master_user_id
        LEFT JOIN garage_services gs ON gs.garage_id = g.id
        LEFT JOIN services s ON s.id = gs.service_id
        GROUP BY g.id, mp.user_id
        ORDER BY g.is_approved ASC, g.id DESC
      `)).map(normalizeGarageRow);
        return { ok: true, garages: rows };
    });
    app.patch("/api/admin/garages/:id/moderation", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        if (auth.role !== "ADMIN")
            return reply.code(403).send({ ok: false, error: "Только для администратора" });
        const id = Number(req.params.id);
        const body = z.object({
            approved: z.coerce.number().int().min(0).max(1),
            reason: z.string().trim().max(500).optional().default(""),
        }).parse(req.body);
        const garage = await app.db.get("SELECT id, title, master_user_id FROM garages WHERE id=?", [id]);
        if (!garage)
            return reply.code(404).send({ ok: false, error: "Гараж не найден" });
        const reason = body.approved === 1 ? "" : body.reason;
        const res = await app.db.run("UPDATE garages SET is_approved=?, moderation_reason=?, moderated_at=? WHERE id=?", [body.approved, reason, Date.now(), id]);
        if (res.changes !== 1)
            return reply.code(404).send({ ok: false, error: "Гараж не найден" });
        if (body.approved === 1) {
            await createNotification(app.db, Number(garage.master_user_id), "MODERATION", "Гараж опубликован", `Карточка «${garage.title}» прошла модерацию и появилась в каталоге.`, `/garage/${id}`);
        }
        else {
            await createNotification(app.db, Number(garage.master_user_id), "MODERATION", "Карточка отклонена", reason || `Карточка «${garage.title}» не прошла модерацию. Проверь данные и отправь заново.`, "/master");
        }
        return { ok: true };
    });
}
