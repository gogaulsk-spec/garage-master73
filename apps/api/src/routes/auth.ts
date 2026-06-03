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
          SELECT id, role, email, phone,
            personal_data_agreed as "personalDataAgreed",
            personal_data_agreed_at as "personalDataAgreedAt",
            created_at as "createdAt"
          FROM users
          WHERE id=?
        `,
        [payload.sub]
      );
      return { ok: true, user };
    } catch {
      return reply.code(401).send({ ok: false });
    }
  });
}
