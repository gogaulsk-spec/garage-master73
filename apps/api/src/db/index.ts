import { Pool, type PoolClient } from "pg";
import { createSchema } from "./schema.js";
import { seed } from "./seed.js";

export type DbRunResult = { changes: number; lastInsertRowid: number | null };

function toPgPlaceholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export class Db {
  private pool?: Pool;
  private client?: PoolClient;

  constructor(source: Pool | PoolClient) {
    if ("release" in source) this.client = source as PoolClient;
    else this.pool = source as Pool;
  }

  private async query(sql: string, params: unknown[] = []) {
    const normalizedSql = toPgPlaceholders(sql);
    if (this.client) return this.client.query(normalizedSql, params);
    if (!this.pool) throw new Error("Database pool is not initialized");
    return this.pool.query(normalizedSql, params);
  }

  async exec(sql: string) {
    await this.query(sql);
  }

  async all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.query(sql, params);
    return result.rows as T[];
  }

  async get<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.query(sql, params);
    return result.rows[0] as T | undefined;
  }

  async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
    const result = await this.query(sql, params);
    const first = result.rows[0] as any;
    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid: first?.id ? Number(first.id) : null,
    };
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (!this.pool) {
      await this.exec("BEGIN");
      try {
        const result = await fn(this);
        await this.exec("COMMIT");
        return result;
      } catch (error) {
        await this.exec("ROLLBACK");
        throw error;
      }
    }

    const client = await this.pool.connect();
    const tx = new Db(client);
    try {
      await client.query("BEGIN");
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

export async function initDb(): Promise<Db> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Create a PostgreSQL database and set DATABASE_URL in .env or Render Environment.");
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

  const db = new Db(pool);
  await createSchema(db);
  return db;
}

export async function seedIfEmpty(db: Db) {
  const row = await db.get<{ c: string | number }>("SELECT COUNT(1) as c FROM services");
  if (!row || Number(row.c) === 0) await seed(db);
}
