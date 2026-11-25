import type { OperatorAppearance } from "./keystones";
import type { MemberKeystone } from "@/components/nfc/member";

/** Includes unknown holdings so a temporary chain outage never hides a pass. */
export const usable = (k: MemberKeystone) => k.status === "active" || k.status === "received" || k.status === "unknown";

/**
 * Keystones by time: live and upcoming (soonest first), ongoing (no dates,
 * newest claim first), then past (most recent first).
 */
export function groupByTime(keystones: MemberKeystone[]) {
  const soon = keystones
    .filter((k) => k.phase === "upcoming" || k.phase === "live")
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const ongoing = keystones
    .filter((k) => !k.phase)
    .sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));
  const past = keystones
    .filter((k) => k.phase === "past")
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  return { soon, ongoing, past, all: [...soon, ...ongoing, ...past] };
}

export type OperatorGroup = {
  operator: { id: string; name: string; appearance?: OperatorAppearance };
  /** Every keystone from this operator, any status. */
  keystones: MemberKeystone[];
  /** Keystones the member can use right now. */
  active: MemberKeystone[];
  time: ReturnType<typeof groupByTime>;
};

/**
 * Keystones grouped by the operator that issued them. An operator counts once
 * the member has at least one usable keystone from it; operators they only
 * used to hold keystones from come back with active: [].
 */
export function groupOperators(keystones: MemberKeystone[]): OperatorGroup[] {
  const groups = new Map<string, MemberKeystone[]>();
  for (const k of keystones) {
    if (!k.operator) continue;
    groups.set(k.operator.id, [...(groups.get(k.operator.id) ?? []), k]);
  }
  return [...groups.values()]
    .map((list) => ({ operator: list[0].operator!, keystones: list, active: list.filter(usable), time: groupByTime(list.filter(usable)) }))
    .sort((a, b) => b.active.length - a.active.length || a.operator.name.localeCompare(b.operator.name));
}

