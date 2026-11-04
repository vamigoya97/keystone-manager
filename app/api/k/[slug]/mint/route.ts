import type { Address } from "viem";
import { getUser, handleAuthError } from "@/lib/auth";
import { checkAccess } from "@/lib/access";
import { mintTo } from "@/lib/chain";
import { findMember, getKeystone, upsertMember, canonicalSlug } from "@/lib/store";
import { getTapSession } from "@/lib/tap";

/**
 * POST /api/k/:slug/mint   (Authorization: Bearer <privy token>)
 *
 * Mints the keystone to the signed-in user's wallet.
 * The operator wallet signs and pays all gas — the user pays nothing.
 *
 * Rules:
 *  - requires a claim session from a chip tap
 *  - one wallet per chip (operators can release a chip in /operator)
 *  - revoked members can't re-claim
 *  - idempotent for existing holders
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    const exp = await getKeystone(slug);
    if (!exp) return Response.json({ error: "Unknown keystone" }, { status: 404 });

    const tap = await getTapSession(exp);
    if (!tap) {
      return Response.json({ error: "Tap your item to secure this keystone" }, { status: 403 });
    }

    const user = await getUser(req);
    const address = user.wallets[0];
    if (!address) {
      return Response.json({ error: "No wallet on this account yet — try again" }, { status: 409 });
    }

    const chipOwner = await findMember(slug, { chipId: tap.chipId });
    if (chipOwner && chipOwner.privyUserId !== user.userId) {
      return Response.json(
        { error: "This item's keystone has already been secured by another account" },
        { status: 409 }
      );
    }

    const access = await checkAccess(exp, user);
    if (access.revoked) {
      return Response.json({ error: "Access to this keystone was revoked" }, { status: 403 });
    }

    // A returning member keeps the chip they originally claimed with.
    const existing = await findMember(slug, { privyUserId: user.userId });

    const record = {
      slug,
      address: existing?.address ?? address,
      privyUserId: user.userId,
      chipId: existing?.chipId ?? tap.chipId,
      claimedAt: existing?.claimedAt ?? new Date().toISOString(),
    };

    if (access.holder) {
      await upsertMember(record);
      return Response.json({ alreadyHolder: true });
    }

    // No contract yet: exercise the flow locally without chain calls.
    if (!exp.token.address) {
      if (process.env.NODE_ENV === "production") {
        return Response.json({ error: "This keystone's contract isn't set up yet" }, { status: 503 });
      }
      await upsertMember(record);
      return Response.json({ demo: true });
    }

    const { hash, explorerUrl } = await mintTo(exp.token, record.address as Address);
    await upsertMember({ ...record, txHash: hash });
    return Response.json({ hash, explorerUrl });
  } catch (err: any) {
    if (err?.shortMessage) {
      console.error("Mint failed:", err.shortMessage);
      return Response.json({ error: err.shortMessage }, { status: 502 });
    }
    return handleAuthError(err);
  }
}
