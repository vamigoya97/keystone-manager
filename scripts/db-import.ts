/**
 * Copy a JSON store (data/store.json) into the database at DATABASE_URL.
 *
 *   npm run db:import                     data/store.json
 *   npm run db:import -- path/to/store.json
 *
 * Applies migrations first, then copies everything in one transaction, so it
 * either all lands or nothing does. Safe to re-run: existing rows are updated
 * in place (matched by operator id, keystone slug, member wallet, batch id,
 * chip key). It never deletes. Prints counts on both sides to compare.
 */
import { readFile } from "fs/promises";
import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local)");
  process.exit(1);
}

const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { getDb, closeDb } = await import("../lib/db/client");
const { chipCounters, itemBatches, keystones, members, operators } = await import("../lib/db/schema");
type Keystone = import("../lib/keystones").Keystone;
type Member = import("../lib/keystones").Member;
type Operator = import("../lib/keystones").Operator;
type ItemBatch = import("../lib/keystones").ItemBatch;

const file = process.argv[2] ?? "data/store.json";
const data = JSON.parse(await readFile(file, "utf8")) as {
  operators?: Operator[];
  keystones?: Keystone[];
  members?: Member[];
  itemBatches?: ItemBatch[];
  chipCounters?: Record<string, number>;
};
const src = {
  operators: data.operators ?? [],
  keystones: data.keystones ?? [],
  members: data.members ?? [],
  itemBatches: data.itemBatches ?? [],
  chipCounters: Object.entries(data.chipCounters ?? {}),
};

// Catch broken references before touching the database.
const opIds = new Set(src.operators.map((o) => o.id));
const slugs = new Set(src.keystones.map((k) => k.slug));
const problems = [
  ...src.keystones.filter((k) => !opIds.has(k.operatorId)).map((k) => `keystone "${k.slug}" has unknown operator "${k.operatorId}"`),
  ...src.members.filter((m) => !slugs.has(m.slug)).map((m) => `member ${m.address} is on unknown keystone "${m.slug}"`),
  ...src.itemBatches.filter((b) => !opIds.has(b.operatorId)).map((b) => `item batch "${b.id}" has unknown operator "${b.operatorId}"`),
];
if (problems.length) {
  console.error(`Not imported; ${file} has broken references:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const db = getDb();
try {
  await migrate(db, { migrationsFolder: "./drizzle" });

  await db.transaction(async (tx) => {
    // In file order, so the database lists things in the same order the file did.
    for (const o of src.operators) {
      await tx
        .insert(operators)
        .values({ id: o.id, name: o.name, createdAt: o.createdAt })
        .onConflictDoUpdate({ target: operators.id, set: { name: o.name, createdAt: o.createdAt } });
    }

    const ids = new Map<string, string>();
    for (const k of src.keystones) {
      const { slug, previousSlugs, chipScope, operatorId, ...rest } = k;
      const cols = { previousSlugs: previousSlugs ?? [], chipScope: chipScope ?? null, operatorId, data: rest };
      const [row] = await tx
        .insert(keystones)
        .values({ slug, ...cols })
        .onConflictDoUpdate({ target: keystones.slug, set: cols })
        .returning({ id: keystones.id });
      ids.set(slug, row.id);
    }

    for (const m of src.members) {
      const values = {
        keystoneId: ids.get(m.slug)!,
        address: m.address.toLowerCase(),
        privyUserId: m.privyUserId,
        chipId: m.chipId,
        claimedAt: m.claimedAt,
        txHash: m.txHash ?? null,
        revoked: !!m.revoked,
      };
      const { keystoneId: _k, address: _a, ...set } = values;
      await tx.insert(members).values(values).onConflictDoUpdate({ target: [members.keystoneId, members.address], set });
    }

    for (const b of src.itemBatches) {
      const values = { id: b.id, operatorId: b.operatorId, name: b.name, tokens: b.tokens, chipSecurity: b.chipSecurity, createdAt: b.createdAt };
      const { id: _i, ...set } = values;
      await tx.insert(itemBatches).values(values).onConflictDoUpdate({ target: itemBatches.id, set });
    }

    // Keep the higher counter if the database already saw a later tap.
    for (const [key, counter] of src.chipCounters) {
      await tx
        .insert(chipCounters)
        .values({ key, counter })
        .onConflictDoUpdate({ target: chipCounters.key, set: { counter: sql`greatest(${chipCounters.counter}, excluded.counter)` } });
    }
  });

  const count = async (table: string) =>
    Number((await db.execute<{ n: string }>(sql.raw(`select count(*) as n from ${table}`))).rows[0].n);
  const rows: [string, number, string][] = [
    ["operators", src.operators.length, "operators"],
    ["keystones", src.keystones.length, "keystones"],
    ["members", src.members.length, "members"],
    ["item batches", src.itemBatches.length, "item_batches"],
    ["chip counters", src.chipCounters.length, "chip_counters"],
  ];
  console.log(`Imported ${file}:`);
  for (const [label, n, table] of rows) console.log(`  ${label.padEnd(14)} file ${String(n).padStart(4)}   database ${String(await count(table)).padStart(4)}`);
} finally {
  await closeDb();
}
