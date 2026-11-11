import type { ItemBatch, Keystone, Member, Operator } from "../keystones";

/** A chip's tap link was already used (its NTAG 424 DNA counter isn't higher than the last one seen). */
export class ReplayError extends Error {}

/** Someone else is claiming with the same item or wallet right now. */
export class ClaimBusyError extends Error {}

/** How long a claim lock lasts if its holder never releases it (a crashed request). */
export const CLAIM_LOCK_MS = 2 * 60_000;

/**
 * Everything the app reads and writes. Two implementations share it:
 * lib/stores/json.ts (data/store.json, for one long-running server) and
 * lib/stores/postgres.ts (DATABASE_URL, for hosting). lib/store.ts picks one.
 */
export interface Store {
  listKeystones(): Promise<Keystone[]>;
  /** Current slug first; a slug the token had before a rename also resolves to it. */
  getKeystone(slug: string): Promise<Keystone | undefined>;
  /** The token's current slug for `slug` (which may be an old one); unknown slugs pass through. */
  canonicalSlug(slug: string): Promise<string>;
  createKeystone(exp: Keystone): Promise<void>;
  /**
   * Move a token to the slug derived from its name, if that differs. The old slug is kept in
   * previousSlugs so links redirect, chips stay bound to chipScope, and members and item
   * batches follow. A taken slug gets a numeric suffix (-2, -3…). Returns the token.
   */
  renameKeystone(slug: string): Promise<Keystone>;
  /** Edit one keystone; `fn` changes it in place. No other edit to it runs at the same time. */
  updateKeystone(slug: string, fn: (exp: Keystone) => void): Promise<Keystone>;

  listMembers(slug: string): Promise<Member[]>;
  findMember(slug: string, match: { address?: string; chipId?: string; privyUserId?: string }): Promise<Member | undefined>;
  upsertMember(member: Member): Promise<void>;
  setMemberRevoked(slug: string, address: string, revoked: boolean): Promise<void>;
  /** Free the member's chip so it can be claimed by another wallet. */
  removeMember(slug: string, address: string): Promise<void>;

  /**
   * Atomically accept a chip's tap counter only if it's higher than any seen
   * before, so each SUN URL works once. Throws ReplayError otherwise.
   */
  recordChipCounter(scope: string, uid: string, counter: number): Promise<void>;

  /**
   * Run `fn` while holding every lock in `keys` (say, one for the item and one
   * for the wallet), so two claims with the same item or wallet can't both
   * mint. Throws ClaimBusyError if another claim holds any of them. Locks are
   * released when `fn` settles, or expire after CLAIM_LOCK_MS.
   */
  withClaimLock<T>(keys: string[], fn: () => Promise<T>): Promise<T>;

  listOperators(): Promise<Operator[]>;
  getOperator(id: string): Promise<Operator | undefined>;
  createOperator(op: Operator): Promise<void>;

  listItemBatches(operatorId?: string): Promise<ItemBatch[]>;
  getItemBatch(id: string): Promise<ItemBatch | undefined>;
  createItemBatch(batch: ItemBatch): Promise<void>;
  updateItemBatch(id: string, fn: (batch: ItemBatch) => void): Promise<ItemBatch>;
}

/** The next free slug for `base`: base itself, else base-2, base-3… within 40 characters. */
export async function nextFreeSlug(base: string, taken: (slug: string) => boolean | Promise<boolean>): Promise<string> {
  let next = base;
  for (let n = 2; await taken(next); n++) next = `${base.slice(0, 40 - `-${n}`.length)}-${n}`;
  return next;
}
