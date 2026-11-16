import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One pool per server process. Works with local Postgres and Neon (use the pooled URL).
const g = globalThis as unknown as { __timberPool?: Pool; __timberDb?: NodePgDatabase<typeof schema> };

export function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}

export function db() {
  if (!g.__timberDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__timberPool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined,
    });
    g.__timberDb = drizzle(g.__timberPool, { schema });
  }
  return g.__timberDb;
}
