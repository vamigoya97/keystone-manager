import { promises as fs } from "fs";
import path from "path";
import {
  exampleKeystones,
  exampleOperators,
  slugify,
  type Keystone,
  type ItemBatch,
  type Member,
  type Operator,
} from "./keystones";

/**
 * Minimal JSON-file store for keystones and members.
 *
 * Fine for a single long-running server (local, VPS, container). On
 * serverless hosts the filesystem is ephemeral — swap these functions for
 * a database (Postgres, Supabase, Vercel KV…) keeping the same signatures.
 */

interface Data {
  operators: Operator[];
  itemBatches: ItemBatch[];
  /** Set once the example operators have been added, so deleting them later sticks. */
  examplesSeeded?: boolean;
  keystones: Keystone[];
  members: Member[];
  /** Last SUN read counter seen per "<slug>:<UID>" (NTAG 424 DNA replay protection). */
  chipCounters: Record<string, number>;
}

const FILE = path.join(process.cwd(), "data", "store.json");

let cache: Data | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Data> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, "utf8")) as Data;
    cache.chipCounters ??= {};
    cache.itemBatches ??= [];
    seedExamples(cache);
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
    cache = {
      operators: [],
      itemBatches: [],
      keystones: [],
      members: [],
      chipCounters: {},
    };
    seedExamples(cache);
    await persist(cache);
  }
  return cache;
}

/** Adds the example operators (ay.llu, GOAT community, Sahar Camp) and their keystones once, so deleting them later sticks. */
function seedExamples(d: Data) {
  if (!d.examplesSeeded) {
    for (const op of exampleOperators()) if (!d.operators.some((o) => o.id === op.id)) d.operators.push(op);
    for (const ex of exampleKeystones()) if (!d.keystones.some((e) => e.slug === ex.slug)) d.keystones.push(ex);
    d.examplesSeeded = true;
  }
}

async function persist(data: Data) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, FILE);
}

/** Serialize read-modify-write cycles so concurrent requests can't clobber each other. */
function mutate<T>(fn: (data: Data) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const data = await load();
    const result = await fn(data);
    await persist(data);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

// ── Keystones ────────────────────────────────────────────────

export async function listKeystones(): Promise<Keystone[]> {
  return (await load()).keystones;
}

/** Current slug first; a slug the token had before a rename also resolves to it. */
function findKeystone(d: Data, slug: string): Keystone | undefined {
  return d.keystones.find((e) => e.slug === slug) ?? d.keystones.find((e) => e.previousSlugs?.includes(slug));
}

/** Is `slug` claimed by another token, as its link, an old link or its chip scope? */
function slugTaken(d: Data, slug: string, except?: Keystone): boolean {
  return d.keystones.some(
    (e) => e !== except && (e.slug === slug || e.chipScope === slug || e.previousSlugs?.includes(slug))
  );
}

export async function getKeystone(slug: string): Promise<Keystone | undefined> {
  return findKeystone(await load(), slug);
}

/** The token's current slug for `slug` (which may be an old one); unknown slugs pass through. */
export async function canonicalSlug(slug: string): Promise<string> {
  return (await getKeystone(slug))?.slug ?? slug;
}

export function createKeystone(exp: Keystone): Promise<void> {
  return mutate((d) => {
    if (slugTaken(d, exp.slug)) {
      throw new Error(`"${exp.slug}" already exists`);
    }
    d.keystones.push(exp);
  });
}

/**
 * Move a token to the slug derived from its name, if that differs. The old slug is kept in
 * previousSlugs so links redirect, chips stay bound to chipScope, and members and item
 * batches follow. A taken slug gets a numeric suffix (-2, -3…). Returns the token.
 */
export function renameKeystone(slug: string): Promise<Keystone> {
  return mutate((d) => {
    const exp = findKeystone(d, slug);
    if (!exp) throw new Error("Keystone not found");
    const base = slugify(exp.name);
    if (!base || base === exp.slug) return exp;

    let next = base;
    for (let n = 2; slugTaken(d, next, exp); n++) next = `${base.slice(0, 40 - `-${n}`.length)}-${n}`;
    if (next === exp.slug) return exp;

    const old = exp.slug;
    exp.chipScope ??= old;
    exp.previousSlugs = [...(exp.previousSlugs ?? []).filter((s) => s !== next), old];
    exp.slug = next;
    for (const m of d.members) if (m.slug === old) m.slug = next;
    for (const b of d.itemBatches) b.tokens = b.tokens.map((t) => (t === old ? next : t));
    return exp;
  });
}

export function updateKeystone(
  slug: string,
  fn: (exp: Keystone) => void
): Promise<Keystone> {
  return mutate((d) => {
    const exp = findKeystone(d, slug);
    if (!exp) throw new Error("Keystone not found");
    fn(exp);
    return exp;
  });
}

// ── Members ────────────────────────────────────────────────────

export async function listMembers(slug: string): Promise<Member[]> {
  return (await load()).members.filter((m) => m.slug === slug);
}

export async function findMember(
  slug: string,
  match: { address?: string; chipId?: string; privyUserId?: string }
): Promise<Member | undefined> {
  return (await load()).members.find(
    (m) =>
      m.slug === slug &&
      ((match.address && m.address === match.address.toLowerCase()) ||
        (match.chipId && m.chipId === match.chipId) ||
        (match.privyUserId && m.privyUserId === match.privyUserId))
  );
}

export function upsertMember(member: Member): Promise<void> {
  return mutate((d) => {
    const i = d.members.findIndex(
      (m) => m.slug === member.slug && m.address === member.address
    );
    if (i >= 0) d.members[i] = { ...d.members[i], ...member };
    else d.members.push(member);
  });
}

export function setMemberRevoked(slug: string, address: string, revoked: boolean) {
  return mutate((d) => {
    const m = d.members.find((x) => x.slug === slug && x.address === address);
    if (!m) throw new Error("Member not found");
    m.revoked = revoked;
  });
}

/** Free the member's chip so it can be claimed by another wallet. */
export function removeMember(slug: string, address: string) {
  return mutate((d) => {
    d.members = d.members.filter((m) => !(m.slug === slug && m.address === address));
  });
}

// ── NTAG 424 DNA counters ──────────────────────────────────────

export class ReplayError extends Error {}

/**
 * Atomically accept a chip's tap counter only if it's higher than any seen
 * before, so each SUN URL works once. Throws ReplayError otherwise.
 */
export function recordChipCounter(slug: string, uid: string, counter: number): Promise<void> {
  return mutate((d) => {
    const key = `${slug}:${uid}`;
    const last = d.chipCounters[key];
    if (last !== undefined && counter <= last) throw new ReplayError("Tap link already used");
    d.chipCounters[key] = counter;
  });
}

// ── Operators ──────────────────────────────────────────────────

export async function listOperators(): Promise<Operator[]> {
  return (await load()).operators;
}

export async function getOperator(id: string): Promise<Operator | undefined> {
  return (await load()).operators.find((o) => o.id === id);
}

export function createOperator(op: Operator): Promise<void> {
  return mutate((d) => {
    if (d.operators.some((o) => o.id === op.id)) throw new Error(`"${op.id}" already exists`);
    d.operators.push(op);
  });
}

// ── Item batches ───────────────────────────────────────────────

export async function listItemBatches(operatorId?: string): Promise<ItemBatch[]> {
  return (await load()).itemBatches.filter((b) => !operatorId || b.operatorId === operatorId);
}

export async function getItemBatch(id: string): Promise<ItemBatch | undefined> {
  return (await load()).itemBatches.find((b) => b.id === id);
}

export function createItemBatch(batch: ItemBatch): Promise<void> {
  return mutate((d) => {
    if (d.itemBatches.some((b) => b.id === batch.id)) throw new Error(`"${batch.id}" already exists`);
    d.itemBatches.push(batch);
  });
}

export function updateItemBatch(id: string, fn: (batch: ItemBatch) => void): Promise<ItemBatch> {
  return mutate((d) => {
    const b = d.itemBatches.find((x) => x.id === id);
    if (!b) throw new Error("Item batch not found");
    fn(b);
    return b;
  });
}
