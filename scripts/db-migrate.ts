/**
 * Apply the SQL migrations in drizzle/ to the database at DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * Safe to run any number of times: applied migrations are recorded and skipped.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { getDb, closeDb } = await import("../lib/db/client");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local)");
  process.exit(1);
}

try {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Database is up to date.");
} finally {
  await closeDb();
}
