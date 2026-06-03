import { z } from "zod";
async function requireAuth(req, reply) {
    try {
        return (await req.jwtVerify());
    }
    catch {
        reply.code(401).send({ ok: false, error: "Не авторизован" });
        return null;
    }
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
        avatarUrl: row.avatarUrl || row.avatar_url || "",
        ratingAvg: Number(row.ratingAvg ?? row.rating_avg ?? 0),
        ratingCount: Number(row.ratingCount ?? row.rating_count ?? 0),
        minPrice: row.minPrice === null || row.minPrice === undefined ? null : Number(row.minPrice),
        servicesList: row.servicesList ? String(row.servicesList).split(",").filter(Boolean) : [],
    };
}
export function registerFavoriteRoutes(app) {
    app.get("/api/favorites", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        const rows = (await app.db.all(`
        SELECT
          g.id, g.title, g.address, g.description, g.cover_url as "coverUrl", g.photo_urls as "photoUrls",
          g.work_schedule as "workSchedule",
          mp.display_name as "masterName", mp.avatar_url as "avatarUrl", mp.rating_avg as "ratingAvg", mp.rating_count as "ratingCount",
          MIN(gs.price_from) as "minPrice",
          STRING_AGG(DISTINCT s.name, ',') as "servicesList",
          fg.created_at as "favoriteCreatedAt"
        FROM favorite_garages fg
        JOIN garages g ON g.id=fg.garage_id
        JOIN master_profiles mp ON mp.user_id=g.master_user_id
        LEFT JOIN garage_services gs ON gs.garage_id=g.id
        LEFT JOIN services s ON s.id=gs.service_id
        WHERE fg.user_id=? AND g.is_approved=1
        GROUP BY g.id, mp.user_id, fg.created_at
        ORDER BY fg.created_at DESC
      `, [auth.sub])).map(normalizeGarageRow);
        return { ok: true, favoriteIds: rows.map((x) => Number(x.id)), garages: rows };
    });
    app.post("/api/favorites/:garageId", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        const garageId = z.coerce.number().int().positive().parse(req.params.garageId);
        const garage = await app.db.get("SELECT id FROM garages WHERE id=? AND is_approved=1", [garageId]);
        if (!garage)
            return reply.code(404).send({ ok: false, error: "Гараж не найден" });
        await app.db.run("INSERT INTO favorite_garages (user_id, garage_id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, garage_id) DO NOTHING", [auth.sub, garageId, Date.now()]);
        return { ok: true };
    });
    app.delete("/api/favorites/:garageId", async (req, reply) => {
        const auth = await requireAuth(req, reply);
        if (!auth)
            return;
        const garageId = z.coerce.number().int().positive().parse(req.params.garageId);
        await app.db.run("DELETE FROM favorite_garages WHERE user_id=? AND garage_id=?", [auth.sub, garageId]);
        return { ok: true };
    });
}
