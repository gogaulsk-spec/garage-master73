import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyPassword, hashPassword } from "../security/password.js";

const authSchema = z.object({
  role: z.enum(["USER", "MASTER"]).default("USER"),
  email: z.string().trim().email(),
  password: z.string().min(6),
  displayName: z.string().trim().min(2).optional(),
  personalDataConsent: z.literal(true, { errorMap: () => ({ message: "Нужно согласие на обработку персональных данных" }) }),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string(),
});

const profileSchema = z.object({
  displayName: z.string().trim().max(80).optional().default(""),
  about: z.string().trim().max(800).optional().default(""),
  avatarUrl: z.string().trim().max(2_500_000).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  carInfo: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
});

const masterProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Укажи имя мастера").max(80),
  about: z.string().trim().max(1200).optional().default(""),
  avatarUrl: z.string().trim().max(2_500_000).optional().default(""),
  experienceYears: z.coerce.number().int().min(0).max(60).optional().default(0),
  specialization: z.string().trim().max(300).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
});

function defaultDisplayName(email: string) {
  const prefix = email.split("@")[0] || "Пользователь";
  return prefix.slice(0, 1).toUpperCase() + prefix.slice(1);
}

async function requireAuth(req: any, reply: any): Promise<{ sub: number; role: string } | null> {
  try {
    return (await req.jwtVerify()) as { sub: number; role: string };
  } catch {
    reply.code(401).send({ ok: false, error: "Не авторизован" });
    return null;
  }
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (req, reply) => {
    const body = authSchema.parse(req.body);

    const now = Date.now();
    const pass = hashPassword(body.password);

    try {
      const res = await app.db.run(
        "INSERT INTO users (role, email, password_hash, personal_data_agreed, personal_data_agreed_at, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        [body.role, body.email.toLowerCase(), pass, 1, now, now]
      );
      const userId = Number(res.lastInsertRowid);

      await app.db.run(
        "INSERT INTO user_profiles (user_id, display_name, about, avatar_url, city, car_info, updated_at) VALUES (?, ?, '', '', '', '', ?) RETURNING user_id",
        [userId, body.displayName || defaultDisplayName(body.email.toLowerCase()), now]
      );

      if (body.role === "MASTER") {
        const dn = body.displayName ?? "Новый мастер";
        await app.db.run("INSERT INTO master_profiles (user_id, display_name, about) VALUES (?, ?, '')", [userId, dn]);
      }

      const token = app.jwt.sign({ sub: userId, role: body.role });
      reply.setCookie("gg_token", token, { httpOnly: true, sameSite: "lax", path: "/" });
      return { ok: true, user: { id: userId, role: body.role, email: body.email.toLowerCase() } };
    } catch {
      reply.code(400);
      return { ok: false, error: "Email уже используется" };
    }
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const row = await app.db.get<any>("SELECT id, role, email, password_hash FROM users WHERE email=?", [email]);
    if (!row) return reply.code(401).send({ ok: false, error: "Неверные данные" });
    if (!verifyPassword(body.password, row.password_hash)) return reply.code(401).send({ ok: false, error: "Неверные данные" });

    const token = app.jwt.sign({ sub: row.id, role: row.role });
    reply.setCookie("gg_token", token, { httpOnly: true, sameSite: "lax", path: "/" });
    return { ok: true, user: { id: row.id, role: row.role, email: row.email } };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie("gg_token", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    try {
      const payload = await req.jwtVerify<{ sub: number; role: string }>();
      const user = await app.db.get(
        `
          SELECT
            u.id, u.role, u.email, u.phone,
            u.personal_data_agreed as "personalDataAgreed",
            u.personal_data_agreed_at as "personalDataAgreedAt",
            u.created_at as "createdAt",
            COALESCE(up.display_name, '') as "displayName",
            COALESCE(up.about, '') as "about",
            COALESCE(up.avatar_url, '') as "avatarUrl",
            COALESCE(up.city, '') as "city",
            COALESCE(up.car_info, '') as "carInfo"
          FROM users u
          LEFT JOIN user_profiles up ON up.user_id=u.id
          WHERE u.id=?
        `,
        [payload.sub]
      );
      return { ok: true, user };
    } catch {
      return reply.code(401).send({ ok: false });
    }
  });


  app.get("/api/profile", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;

    const user = await app.db.get(
      `
        SELECT
          u.id, u.role, u.email, u.phone,
          COALESCE(up.display_name, '') as "displayName",
          COALESCE(up.about, '') as "about",
          COALESCE(up.avatar_url, '') as "avatarUrl",
          COALESCE(up.city, '') as "city",
          COALESCE(up.car_info, '') as "carInfo",
          COALESCE(up.updated_at, u.created_at) as "updatedAt"
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id=u.id
        WHERE u.id=?
      `,
      [auth.sub]
    );

    return { ok: true, profile: user };
  });

  app.patch("/api/profile", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;

    const body = profileSchema.parse(req.body ?? {});
    const now = Date.now();
    const phone = body.phone.trim() ? body.phone.trim() : null;

    try {
      await app.db.transaction(async (tx) => {
        await tx.run("UPDATE users SET phone=? WHERE id=?", [phone, auth.sub]);
        await tx.run(
          `
            INSERT INTO user_profiles (user_id, display_name, about, avatar_url, city, car_info, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE SET
              display_name=EXCLUDED.display_name,
              about=EXCLUDED.about,
              avatar_url=EXCLUDED.avatar_url,
              city=EXCLUDED.city,
              car_info=EXCLUDED.car_info,
              updated_at=EXCLUDED.updated_at
          `,
          [auth.sub, body.displayName, body.about, body.avatarUrl, body.city, body.carInfo, now]
        );
      });
    } catch {
      return reply.code(400).send({ ok: false, error: "Не удалось сохранить профиль. Возможно, телефон уже используется другим аккаунтом." });
    }


    return { ok: true };
  });

  app.get("/api/master/profile", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "MASTER") return reply.code(403).send({ ok: false, error: "Только для мастеров" });
    const profile = await app.db.get(
      `
        SELECT
          mp.user_id as "userId", mp.display_name as "displayName", mp.about, mp.avatar_url as "avatarUrl",
          mp.rating_avg as "ratingAvg", mp.rating_count as "ratingCount",
          COALESCE(mp.experience_years, 0) as "experienceYears",
          COALESCE(mp.specialization, '') as "specialization",
          COALESCE(mp.city, '') as "city",
          COALESCE(mp.phone, '') as "phone"
        FROM master_profiles mp WHERE mp.user_id=?
      `,
      [auth.sub]
    );
    return { ok: true, profile };
  });

  app.patch("/api/master/profile", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.role !== "MASTER") return reply.code(403).send({ ok: false, error: "Только для мастеров" });
    const body = masterProfileSchema.parse(req.body ?? {});
    await app.db.run(
      `
        INSERT INTO master_profiles (user_id, display_name, about, avatar_url, experience_years, specialization, city, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          display_name=EXCLUDED.display_name,
          about=EXCLUDED.about,
          avatar_url=EXCLUDED.avatar_url,
          experience_years=EXCLUDED.experience_years,
          specialization=EXCLUDED.specialization,
          city=EXCLUDED.city,
          phone=EXCLUDED.phone
      `,
      [auth.sub, body.displayName, body.about, body.avatarUrl, body.experienceYears, body.specialization, body.city, body.phone]
    );
    await app.db.run("UPDATE users SET phone=? WHERE id=?", [body.phone || null, auth.sub]);
    return { ok: true };
  });

  app.get("/api/users/:id/profile", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;

    const id = Number((req.params as any).id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ ok: false, error: "Некорректный клиент" });

    let canView = auth.role === "ADMIN" || auth.sub === id;
    if (!canView && auth.role === "MASTER") {
      const relation = await app.db.get<{ id: number }>(
        `
          SELECT b.id
          FROM bookings b
          JOIN garages g ON g.id=b.garage_id
          WHERE b.user_id=? AND g.master_user_id=?
          LIMIT 1
        `,
        [id, auth.sub]
      );
      canView = !!relation;
    }

    if (!canView) return reply.code(403).send({ ok: false, error: "Профиль доступен только мастеру, у которого есть заявка этого клиента" });

    const profile = await app.db.get<any>(
      `
        SELECT
          u.id, u.role, u.email, u.phone, u.created_at as "createdAt",
          COALESCE(up.display_name, '') as "displayName",
          COALESCE(up.about, '') as "about",
          COALESCE(up.avatar_url, '') as "avatarUrl",
          COALESCE(up.city, '') as "city",
          COALESCE(up.car_info, '') as "carInfo",
          COALESCE(up.updated_at, u.created_at) as "updatedAt"
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id=u.id
        WHERE u.id=? AND u.role='USER'
      `,
      [id]
    );

    if (!profile) return reply.code(404).send({ ok: false, error: "Клиент не найден" });

    const scopedParams = auth.role === "MASTER" ? [id, auth.sub] : [id];
    const scopedWhere = auth.role === "MASTER" ? "b.user_id=? AND g.master_user_id=?" : "b.user_id=?";

    const stats = await app.db.get<any>(
      `
        SELECT
          COUNT(*) as "bookingsTotal",
          SUM(CASE WHEN b.status='DONE' THEN 1 ELSE 0 END) as "bookingsDone",
          SUM(CASE WHEN b.status='CANCELLED' THEN 1 ELSE 0 END) as "bookingsCancelled",
          SUM(CASE WHEN b.status IN ('NEW','CONFIRMED','IN_PROGRESS') THEN 1 ELSE 0 END) as "bookingsActive"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        WHERE ${scopedWhere}
      `,
      scopedParams
    );

    const reviews = await app.db.get<any>(
      `
        SELECT COUNT(*) as "reviewsTotal", COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) as "ratingAvg"
        FROM reviews r
        JOIN garages g ON g.id=r.garage_id
        WHERE ${auth.role === "MASTER" ? "r.user_id=? AND g.master_user_id=?" : "r.user_id=?"}
      `,
      scopedParams
    );

    const bookings = await app.db.all<any>(
      `
        SELECT
          b.id, b.status, b.slot_start as "slotStart", b.slot_end as "slotEnd", b.created_at as "createdAt",
          b.cancel_reason as "cancelReason", b.master_comment as "masterComment",
          g.id as "garageId", g.title as "garageTitle", g.address as "garageAddress",
          s.name as "serviceName", s.category as "serviceCategory"
        FROM bookings b
        JOIN garages g ON g.id=b.garage_id
        JOIN services s ON s.id=b.service_id
        WHERE ${scopedWhere}
        ORDER BY b.slot_start DESC
        LIMIT 50
      `,
      scopedParams
    );

    return { ok: true, profile, stats: { ...stats, ...reviews }, bookings };
  });

}
