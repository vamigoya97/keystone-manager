import type { Store } from "./stores/types";
import { jsonStore } from "./stores/json";
import { postgresStore } from "./stores/postgres";

/**
 * The app's data: keystones, members, operators, item batches and chip
 * counters. With DATABASE_URL set it lives in Postgres (lib/stores/postgres.ts,
 * for hosting); otherwise in data/store.json (lib/stores/json.ts, for one
 * long-running server). Both behave the same; see lib/stores/types.ts.
 */

export { ReplayError, ClaimBusyError } from "./stores/types";

// Decided per call, so scripts that load .env.local after importing this still pick the right store.
const store = (): Store => (process.env.DATABASE_URL ? postgresStore : jsonStore);

export const listKeystones: Store["listKeystones"] = () => store().listKeystones();
export const getKeystone: Store["getKeystone"] = (slug) => store().getKeystone(slug);
export const canonicalSlug: Store["canonicalSlug"] = (slug) => store().canonicalSlug(slug);
export const createKeystone: Store["createKeystone"] = (exp) => store().createKeystone(exp);
export const renameKeystone: Store["renameKeystone"] = (slug) => store().renameKeystone(slug);
export const updateKeystone: Store["updateKeystone"] = (slug, fn) => store().updateKeystone(slug, fn);

export const listMembers: Store["listMembers"] = (slug) => store().listMembers(slug);
export const findMember: Store["findMember"] = (slug, match) => store().findMember(slug, match);
export const upsertMember: Store["upsertMember"] = (member) => store().upsertMember(member);
export const setMemberRevoked: Store["setMemberRevoked"] = (slug, address, revoked) => store().setMemberRevoked(slug, address, revoked);
export const removeMember: Store["removeMember"] = (slug, address) => store().removeMember(slug, address);

export const recordChipCounter: Store["recordChipCounter"] = (scope, uid, counter) => store().recordChipCounter(scope, uid, counter);
export function withClaimLock<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
  return store().withClaimLock(keys, fn);
}

export const listOperators: Store["listOperators"] = () => store().listOperators();
export const getOperator: Store["getOperator"] = (id) => store().getOperator(id);
export const createOperator: Store["createOperator"] = (op) => store().createOperator(op);

export const listItemBatches: Store["listItemBatches"] = (operatorId) => store().listItemBatches(operatorId);
export const getItemBatch: Store["getItemBatch"] = (id) => store().getItemBatch(id);
export const createItemBatch: Store["createItemBatch"] = (batch) => store().createItemBatch(batch);
export const updateItemBatch: Store["updateItemBatch"] = (id, fn) => store().updateItemBatch(id, fn);
