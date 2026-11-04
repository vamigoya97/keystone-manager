import { handleAuthError, requireOperator } from "@/lib/auth";
import { operatorWallet } from "@/lib/chain";
import { keystonePhase } from "@/lib/keystones";
import { listKeystones, listItemBatches, listMembers, listOperators } from "@/lib/store";

/**
 * GET /api/admin/overview
 * → operators, every keystone (with member counts and date phase), item batches and the gas wallet.
 */
export async function GET(req: Request) {
  try {
    await requireOperator(req);
    const keystones = await Promise.all(
      (await listKeystones()).map(async (exp) => ({
        ...exp,
        phase: keystonePhase(exp),
        memberCount: (await listMembers(exp.slug)).filter((m) => !m.revoked).length,
      }))
    );
    const wallet = await operatorWallet().catch((err: Error) => ({
      error: err.message.includes("PRIVATE_KEY") ? "Operator wallet not configured (PRIVATE_KEY)" : "Could not reach the network",
    }));
    return Response.json({ operators: await listOperators(), keystones, itemBatches: await listItemBatches(), wallet });
  } catch (err) {
    return handleAuthError(err);
  }
}
