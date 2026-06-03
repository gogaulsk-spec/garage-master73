import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import statik from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { initDb, seedIfEmpty, type Db } from "./db/index.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerGarageRoutes } from "./routes/garages.js";
import { registerBookingRoutes } from "./routes/bookings.js";
import { registerFavoriteRoutes } from "./routes/favorites.js";
import { registerSupportRoutes } from "./routes/support.js";
import { attachSocket } from "./ws/socket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });

await app.register(cors, {
  origin: true,
  credentials: true,
});
await app.register(cookie);
await app.register(jwt, {
  secret: process.env.JWT_SECRET || "dev-secret-change-me",
  cookie: { cookieName: "gg_token", signed: false },
});

const db = await initDb();
await seedIfEmpty(db);
app.decorate("db", db);

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ ok: false, error: error.issues[0]?.message ?? "Некорректные данные" });
  }
  app.log.error(error);
  return reply.code(500).send({ ok: false, error: "Ошибка сервера" });
});

app.get("/api/health", async () => ({ ok: true, name: "garage-master", ts: Date.now() }));
registerAuthRoutes(app);
registerGarageRoutes(app);
registerBookingRoutes(app);
registerFavoriteRoutes(app);
registerSupportRoutes(app);

const publicDir = path.join(__dirname, "..", "public");
await app.register(statik, { root: publicDir, prefix: "/" });

app.setNotFoundHandler(async (req, reply) => {
  if (req.url.startsWith("/api")) {
    reply.code(404).send({ ok: false, error: "Not found" });
    return;
  }
  return reply.sendFile("index.html");
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const server = await app.listen({ port, host });
attachSocket(app.server);

app.log.info(`✅ Open http://${host}:${port}`);
export default server;

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}
