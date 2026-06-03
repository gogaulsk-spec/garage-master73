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
}
