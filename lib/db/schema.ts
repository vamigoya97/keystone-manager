import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { Keystone } from "../keystones";

/**
 * Postgres tables for lib/stores/postgres.ts. Change a table here, then run
 * `npm run db:generate` to write a migration into drizzle/ and
 * `npm run db:migrate` to apply it.
 */

export const operators = pgTable("operators", {
  id: text("id").primaryKey(),
  /** Keeps the order operators were created in. */
  seq: bigserial("seq", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

/** Everything about a keystone that isn't a column below: name, dates, artwork, theme, vault, token… */
export type KeystoneData = Omit<Keystone, "slug" | "previousSlugs" | "chipScope" | "operatorId">;

export const keystones = pgTable(
  "keystones",
  {
    /** Never changes, so members stay attached through renames. */
    id: uuid("id").primaryKey().defaultRandom(),
    /** Keeps the order keystones were created in. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    slug: text("slug").notNull().unique(),
    previousSlugs: text("previous_slugs").array().notNull().default(sql`'{}'::text[]`),
    /** What chips are signed with (the original slug); unset until the first rename. */
    chipScope: text("chip_scope"),
    operatorId: text("operator_id")
      .notNull()
      .references(() => operators.id),
    data: jsonb("data").$type<KeystoneData>().notNull(),
  },
  (t) => [index("keystones_previous_slugs_idx").using("gin", t.previousSlugs)]
);

export const members = pgTable(
  "members",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    keystoneId: uuid("keystone_id")
      .notNull()
      .references(() => keystones.id, { onDelete: "cascade" }),
    /** Lowercase 0x address. */
    address: text("address").notNull(),
    privyUserId: text("privy_user_id").notNull(),
    chipId: text("chip_id").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "string" }).notNull(),
    txHash: text("tx_hash"),
    revoked: boolean("revoked").notNull().default(false),
  },
  (t) => [
    // One membership per wallet per keystone, and one wallet per item.
    unique("members_keystone_address").on(t.keystoneId, t.address),
    unique("members_keystone_chip").on(t.keystoneId, t.chipId),
    index("members_keystone_privy_idx").on(t.keystoneId, t.privyUserId),
  ]
);

export const itemBatches = pgTable("item_batches", {
  id: text("id").primaryKey(),
  seq: bigserial("seq", { mode: "number" }).notNull(),
  operatorId: text("operator_id")
    .notNull()
    .references(() => operators.id),
  name: text("name").notNull(),
  /** Slugs of the keystones these items unlock (renames rewrite them). */
  tokens: text("tokens").array().notNull(),
  chipSecurity: text("chip_security").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

/** Last NTAG 424 DNA read counter seen per "<scope>:<UID>", for replay protection. */
export const chipCounters = pgTable("chip_counters", {
  key: text("key").primaryKey(),
  counter: bigint("counter", { mode: "number" }).notNull(),
});

/** Short-lived locks so two claims with the same item or wallet can't both mint. */
export const claimLocks = pgTable("claim_locks", {
  key: text("key").primaryKey(),
  /** Identifies the request holding it, so only that request releases it. */
  holder: text("holder").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
