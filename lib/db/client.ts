import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

// One pool per server process. Kept on globalThis so dev reloads don't open a new pool on every edit.
const g = globalThis as typeof globalThis & { __keystoneDb?: { db: Db; pool: Pool } };

/** The database at DATABASE_URL. On Neon, use the pooled connection string (host contains "-pooler"). */
export function getDb(): Db {
  if (!g.__keystoneDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // Serverless functions each hold a few connections; Neon's pooler fans them in.
    const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
    g.__keystoneDb = { db: drizzle(pool, { schema }), pool };
  }
  return g.__keystoneDb.db;
}

/** Close the pool (scripts and tests, so the process can exit). */
export async function closeDb() {
  const current = g.__keystoneDb;
  g.__keystoneDb = undefined;
  await current?.pool.end();
}
