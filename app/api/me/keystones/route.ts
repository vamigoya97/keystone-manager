import { findUserMember } from "@/lib/access";
import { getUser, handleAuthError } from "@/lib/auth";
import { holdsToken } from "@/lib/chain";
import {
  keystonePhase,
  formatDates,
  type Keystone,
  type Member,
  type Operator,
} from "@/lib/keystones";
import { listKeystones, listOperators } from "@/lib/store";

/**
 * Keystone status, decided with the same rules as the gallery:
 *  active    claimed here and still held
 *  received  held, but never claimed here (transferred in)
 *  not-held  claimed here, but no longer held (transferred away)
 *  revoked   revoked by an operator — no access whatever they hold
 *  unknown   couldn't reach the chain; the gallery re-checks on open
 */
type PassStatus = "active" | "received" | "not-held" | "revoked" | "unknown";

const ORDER: Record<PassStatus, number> = { active: 0, received: 0, unknown: 0, "not-held": 1, revoked: 2 };

/**
 * GET /api/me/keystones   (Authorization: Bearer <privy token>)
 *
 * Every keystone the signed-in user has: claimed here and/or currently held
 * on chain by any of their linked wallets.
 */
export async function GET(req: Request) {
  try {
    const user = await getUser(req);
    const operators = new Map((await listOperators()).map((o) => [o.id, o]));
    const view = (exp: Keystone, member: Member | undefined, status: PassStatus) =>
      toView(exp, operators.get(exp.operatorId), member, status);

    const rows = await Promise.all(
      (await listKeystones()).map(async (exp) => {
        const member = await findUserMember(exp.slug, user);
        if (member?.revoked) return view(exp, member, "revoked");

        // Demo mode: no contract, so the claim record is the keystone.
        if (!exp.token.address) return member ? view(exp, member, "active") : null;

        let holds: boolean;
        try {
          holds = await holdsToken(exp.token, user.wallets, { strict: true });
        } catch {
          return member ? view(exp, member, "unknown") : null;
        }
        if (holds) return view(exp, member, member ? "active" : "received");
        return member ? view(exp, member, "not-held") : null;
      })
    );

    const keystones = rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));

    return Response.json({ keystones });
  } catch (err) {
    return handleAuthError(err);
  }
}

function toView(exp: Keystone, operator: Operator | undefined, member: Member | undefined, status: PassStatus) {
  return {
    slug: exp.slug,
    name: exp.name,
    operator: operator ? { id: operator.id, name: operator.name } : null,
    startDate: exp.startDate ?? null,
    endDate: exp.endDate ?? null,
    dateLabel: formatDates(exp) ?? null,
    phase: keystonePhase(exp),
    location: exp.location ?? null,
    palette: exp.palette,
    tokenImage: exp.tokenImage,
    symbol: exp.token.symbol,
    claimedAt: member?.claimedAt ?? null,
    status,
    photos: exp.gallery.length,
  };
}
