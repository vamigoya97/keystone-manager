/**
 * A local Postgres for development and tests, with no install: a real
 * Postgres 17 server from the embedded-postgres package. Data lives in
 * data/postgres (ignored by git). Runs until Ctrl+C.
 *
 *   npm run db:local
 *
 * Then, in .env.local:
 *   DATABASE_URL=postgres://keystone:keystone@localhost:5433/keystone
 * and for tests (this one gets wiped on every test run):
 *   TEST_DATABASE_URL=postgres://keystone:keystone@localhost:5433/keystone_test
 */
import { existsSync } from "fs";
import path from "path";
import EmbeddedPostgres from "embedded-postgres";

const dir = path.join(process.cwd(), "data", "postgres");
const fresh = !existsSync(path.join(dir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "keystone",
  password: "keystone",
  port: 5433,
  persistent: true,
  // Local only: never listen beyond this machine.
  postgresFlags: ["-c", "listen_addresses=localhost"],
  onLog: () => {},
});

if (fresh) await pg.initialise();
await pg.start();
for (const name of ["keystone", "keystone_test"]) {
  try {
    await pg.createDatabase(name);
  } catch {
    // Already there.
  }
}
console.log(`Postgres 17 is running on localhost:5433 (data in ${path.relative(process.cwd(), dir)}). Ctrl+C to stop.`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Keep the process alive while the server runs.
setInterval(() => {}, 1 << 30);
