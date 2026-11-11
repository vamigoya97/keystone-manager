import { randomUUID } from "crypto";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { slugify, type ItemBatch, type Keystone, type Member, type Operator } from "../keystones";
import { getDb, type Db } from "../db/client";
import { chipCounters, claimLocks, itemBatches, keystones, members, operators, type KeystoneData } from "../db/schema";
import { CLAIM_LOCK_MS, ClaimBusyError, nextFreeSlug, ReplayError, type Store } from "./types";

/**
 * Postgres store (DATABASE_URL), for hosting. Same behavior as the JSON
 * file store, with the database doing what the file store's single write
 * queue did: edits run in transactions with the row locked, slugs and
 * memberships are unique, and the chip counter check is one statement.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;
type KeystoneRow = typeof keystones.$inferSelect;

/** Timestamps come back as Postgres text ("2026-11-04 00:23:29.76+00"); the app uses ISO strings. */
const iso = (t: string) => new Date(t).toISOString();

/** Serializes slug changes (create and rename) so two can't pick the same free slug. */
const SLUG_LOCK = 0x6b6579; // "key"

function toKeystone(row: KeystoneRow): Keystone {
  return {
    ...row.data,
    slug: row.slug,
    ...(row.previousSlugs.length ? { previousSlugs: row.previousSlugs } : {}),
    ...(row.chipScope ? { chipScope: row.chipScope } : {}),
    operatorId: row.operatorId,
  };
}

function keystoneColumns(exp: Keystone) {
  const { slug, previousSlugs, chipScope, operatorId, ...data } = exp;
  return { slug, previousSlugs: previousSlugs ?? [], chipScope: chipScope ?? null, operatorId, data: data as KeystoneData };
}

/** The keystone row for a current or old slug, locked for this transaction when `forUpdate`. */
async function findRow(c: Conn, slug: string, forUpdate = false): Promise<KeystoneRow | undefined> {
  const q = (where: ReturnType<typeof eq>) => {
    const base = c.select().from(keystones).where(where).orderBy(asc(keystones.seq)).limit(1);
    return forUpdate ? base.for("update") : base;
  };
  const [current] = await q(eq(keystones.slug, slug));
  if (current) return current;
  const [renamed] = await q(sql`${slug} = any(${keystones.previousSlugs})`);
  return renamed;
}

/** Is `slug` claimed by another token, as its link, an old link or its chip scope? */
async function slugTaken(c: Conn, slug: string, exceptId?: string): Promise<boolean> {
  const rows = await c
    .select({ id: keystones.id })
    .from(keystones)
    .where(
      and(
        or(eq(keystones.slug, slug), eq(keystones.chipScope, slug), sql`${slug} = any(${keystones.previousSlugs})`),
        exceptId ? sql`${keystones.id} <> ${exceptId}` : undefined
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** The id of the keystone whose current slug is `slug`. */
async function keystoneId(c: Conn, slug: string): Promise<string | undefined> {
  const [row] = await c.select({ id: keystones.id }).from(keystones).where(eq(keystones.slug, slug)).limit(1);
  return row?.id;
}

// ── Keystones ────────────────────────────────────────────────

async function listKeystones(): Promise<Keystone[]> {
  const rows = await getDb().select().from(keystones).orderBy(asc(keystones.seq));
  return rows.map(toKeystone);
}

async function getKeystone(slug: string): Promise<Keystone | undefined> {
  const row = await findRow(getDb(), slug);
  return row && toKeystone(row);
}

async function canonicalSlug(slug: string): Promise<string> {
  return (await getKeystone(slug))?.slug ?? slug;
}

async function createKeystone(exp: Keystone): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SLUG_LOCK})`);
    if (await slugTaken(tx, exp.slug)) throw new Error(`"${exp.slug}" already exists`);
    await tx.insert(keystones).values(keystoneColumns(exp));
  });
}

async function renameKeystone(slug: string): Promise<Keystone> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SLUG_LOCK})`);
    const row = await findRow(tx, slug, true);
    if (!row) throw new Error("Keystone not found");
    const exp = toKeystone(row);
    const base = slugify(exp.name);
    if (!base || base === exp.slug) return exp;

    const next = await nextFreeSlug(base, (s) => slugTaken(tx, s, row.id));
    if (next === exp.slug) return exp;

    const old = exp.slug;
    exp.chipScope ??= old;
    exp.previousSlugs = [...(exp.previousSlugs ?? []).filter((s) => s !== next), old];
    exp.slug = next;
    await tx.update(keystones).set(keystoneColumns(exp)).where(eq(keystones.id, row.id));
    // Members follow by keystone id; item batches list slugs, so rewrite those.
    await tx
      .update(itemBatches)
      .set({ tokens: sql`array_replace(${itemBatches.tokens}, ${old}, ${next})` })
      .where(sql`${old} = any(${itemBatches.tokens})`);
    return exp;
  });
}

async function updateKeystone(slug: string, fn: (exp: Keystone) => void): Promise<Keystone> {
  return getDb().transaction(async (tx) => {
    const row = await findRow(tx, slug, true);
    if (!row) throw new Error("Keystone not found");
    const exp = toKeystone(row);
    fn(exp);
    await tx.update(keystones).set(keystoneColumns(exp)).where(eq(keystones.id, row.id));
    return exp;
  });
}

// ── Members ────────────────────────────────────────────────────

const memberFields = {
  slug: keystones.slug,
  address: members.address,
  privyUserId: members.privyUserId,
  chipId: members.chipId,
  claimedAt: members.claimedAt,
  txHash: members.txHash,
  revoked: members.revoked,
};

type MemberRow = { slug: string; address: string; privyUserId: string; chipId: string; claimedAt: string; txHash: string | null; revoked: boolean };

function toMember(r: MemberRow): Member {
  return {
    slug: r.slug,
    address: r.address,
    privyUserId: r.privyUserId,
    chipId: r.chipId,
    claimedAt: iso(r.claimedAt),
    ...(r.txHash ? { txHash: r.txHash } : {}),
    ...(r.revoked ? { revoked: true } : {}),
  };
}

async function listMembers(slug: string): Promise<Member[]> {
  const rows = await getDb()
    .select(memberFields)
    .from(members)
    .innerJoin(keystones, eq(members.keystoneId, keystones.id))
    .where(eq(keystones.slug, slug))
    .orderBy(asc(members.seq));
  return rows.map(toMember);
}

async function findMember(
  slug: string,
  match: { address?: string; chipId?: string; privyUserId?: string }
): Promise<Member | undefined> {
  const any = or(
    match.address ? eq(members.address, match.address.toLowerCase()) : undefined,
    match.chipId ? eq(members.chipId, match.chipId) : undefined,
    match.privyUserId ? eq(members.privyUserId, match.privyUserId) : undefined
  );
  if (!any) return undefined;
  const [row] = await getDb()
    .select(memberFields)
    .from(members)
    .innerJoin(keystones, eq(members.keystoneId, keystones.id))
    .where(and(eq(keystones.slug, slug), any))
    .orderBy(asc(members.seq))
    .limit(1);
  return row && toMember(row);
}

async function upsertMember(member: Member): Promise<void> {
  const db = getDb();
  const id = await keystoneId(db, member.slug);
  if (!id) throw new Error("Keystone not found");
  // Like the file store's { ...old, ...member }: fields the caller leaves out keep their saved values.
  const set: Partial<typeof members.$inferInsert> = {
    privyUserId: member.privyUserId,
    chipId: member.chipId,
    claimedAt: member.claimedAt,
  };
  if ("txHash" in member) set.txHash = member.txHash ?? null;
  if ("revoked" in member) set.revoked = !!member.revoked;
  await db
    .insert(members)
    .values({
      keystoneId: id,
      address: member.address,
      privyUserId: member.privyUserId,
      chipId: member.chipId,
      claimedAt: member.claimedAt,
      txHash: member.txHash ?? null,
      revoked: !!member.revoked,
    })
    .onConflictDoUpdate({ target: [members.keystoneId, members.address], set });
}

async function setMemberRevoked(slug: string, address: string, revoked: boolean): Promise<void> {
  const db = getDb();
  const id = await keystoneId(db, slug);
  const rows = id
    ? await db
        .update(members)
        .set({ revoked })
        .where(and(eq(members.keystoneId, id), eq(members.address, address)))
        .returning({ seq: members.seq })
    : [];
  if (!rows.length) throw new Error("Member not found");
}

async function removeMember(slug: string, address: string): Promise<void> {
  const db = getDb();
  const id = await keystoneId(db, slug);
  if (id) await db.delete(members).where(and(eq(members.keystoneId, id), eq(members.address, address)));
}

// ── NTAG 424 DNA counters ──────────────────────────────────────

async function recordChipCounter(scope: string, uid: string, counter: number): Promise<void> {
  // Insert, or raise the saved counter only if this one is higher: one statement, so two taps can't both pass.
  const rows = await getDb()
    .insert(chipCounters)
    .values({ key: `${scope}:${uid}`, counter })
    .onConflictDoUpdate({
      target: chipCounters.key,
      set: { counter: sql`excluded.counter` },
      setWhere: lt(chipCounters.counter, sql`excluded.counter`),
    })
    .returning({ key: chipCounters.key });
  if (!rows.length) throw new ReplayError("Tap link already used");
}

// ── Claim locks ───────────────────────────────────────────────

async function withClaimLock<T>(unsorted: string[], fn: () => Promise<T>): Promise<T> {
  const db = getDb();
  // Always in the same order, so two claims taking overlapping locks can't deadlock.
  const keys = [...new Set(unsorted)].sort();
  const holder = randomUUID();
  const expiresAt = new Date(Date.now() + CLAIM_LOCK_MS);
  // Take every lock that's free or expired, in one statement.
  const taken = await db
    .insert(claimLocks)
    .values(keys.map((key) => ({ key, holder, expiresAt })))
    .onConflictDoUpdate({
      target: claimLocks.key,
      set: { holder: sql`excluded.holder`, expiresAt: sql`excluded.expires_at` },
      setWhere: lt(claimLocks.expiresAt, sql`now()`),
    })
    .returning({ key: claimLocks.key });
  const release = () => db.delete(claimLocks).where(and(inArray(claimLocks.key, keys), eq(claimLocks.holder, holder)));
  if (taken.length < keys.length) {
    await release();
    throw new ClaimBusyError("A claim for this item is already in progress");
  }
  try {
    return await fn();
  } finally {
    await release();
  }
}

// ── Operators ──────────────────────────────────────────────────

const toOperator = (r: typeof operators.$inferSelect): Operator => ({ id: r.id, name: r.name, createdAt: iso(r.createdAt) });

async function listOperators(): Promise<Operator[]> {
  return (await getDb().select().from(operators).orderBy(asc(operators.seq))).map(toOperator);
}

async function getOperator(id: string): Promise<Operator | undefined> {
  const [row] = await getDb().select().from(operators).where(eq(operators.id, id)).limit(1);
  return row && toOperator(row);
}

async function createOperator(op: Operator): Promise<void> {
  const rows = await getDb()
    .insert(operators)
    .values({ id: op.id, name: op.name, createdAt: op.createdAt })
    .onConflictDoNothing()
    .returning({ id: operators.id });
  if (!rows.length) throw new Error(`"${op.id}" already exists`);
}

// ── Item batches ───────────────────────────────────────────────

const toBatch = (r: typeof itemBatches.$inferSelect): ItemBatch => ({
  id: r.id,
  operatorId: r.operatorId,
  name: r.name,
  tokens: r.tokens,
  chipSecurity: r.chipSecurity as ItemBatch["chipSecurity"],
  createdAt: iso(r.createdAt),
});

async function listItemBatches(operatorId?: string): Promise<ItemBatch[]> {
  const rows = await getDb()
    .select()
    .from(itemBatches)
    .where(operatorId ? eq(itemBatches.operatorId, operatorId) : undefined)
    .orderBy(asc(itemBatches.seq));
  return rows.map(toBatch);
}

async function getItemBatch(id: string): Promise<ItemBatch | undefined> {
  const [row] = await getDb().select().from(itemBatches).where(eq(itemBatches.id, id)).limit(1);
  return row && toBatch(row);
}

async function createItemBatch(batch: ItemBatch): Promise<void> {
  const rows = await getDb()
    .insert(itemBatches)
    .values({ ...batch })
    .onConflictDoNothing()
    .returning({ id: itemBatches.id });
  if (!rows.length) throw new Error(`"${batch.id}" already exists`);
}

async function updateItemBatch(id: string, fn: (batch: ItemBatch) => void): Promise<ItemBatch> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(itemBatches).where(eq(itemBatches.id, id)).for("update");
    if (!row) throw new Error("Item batch not found");
    const b = toBatch(row);
    fn(b);
    await tx
      .update(itemBatches)
      .set({ operatorId: b.operatorId, name: b.name, tokens: b.tokens, chipSecurity: b.chipSecurity })
      .where(eq(itemBatches.id, id));
    return b;
  });
}

export const postgresStore: Store = {
  listKeystones,
  getKeystone,
  canonicalSlug,
  createKeystone,
  renameKeystone,
  updateKeystone,
  listMembers,
  findMember,
  upsertMember,
  setMemberRevoked,
  removeMember,
  recordChipCounter,
  withClaimLock,
  listOperators,
  getOperator,
  createOperator,
  listItemBatches,
  getItemBatch,
  createItemBatch,
  updateItemBatch,
};
