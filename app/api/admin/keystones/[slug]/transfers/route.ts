import type { Address } from "viem";
import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { freezePassTransferRule, readPassMetadata, setPassTransferable } from "@/lib/chain";
import { getKeystone, canonicalSlug } from "@/lib/store";

/**
 * POST /api/admin/keystones/:slug/transfers
 *   { action: "set", transferable: boolean }  — allow or block (soulbound) transfers
 *   { action: "freeze" }                      — make the current rule permanent
 *
 * Enforced by the KeystonePass contract itself; gas paid by the operator wallet.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const exp = await getKeystone(slug);
    if (!exp?.token.address) {
      return Response.json({ error: "No contract deployed yet" }, { status: 400 });
    }

    const address = exp.token.address as Address;
    const current = await readPassMetadata(address);
    if (!current || current.transferable === null) {
      return Response.json(
        { error: "This contract doesn't support transfer controls. Deploy a new keystone contract to use them." },
        { status: 400 }
      );
    }
    if (current.transferRuleFrozen) {
      return Response.json({ error: "The transfer rule is locked permanently" }, { status: 409 });
    }

    const body = (await req.json().catch(() => ({}))) as { action?: string; transferable?: unknown };
    if (body.action === "freeze") return Response.json(await freezePassTransferRule(address));
    if (body.action === "set" && typeof body.transferable === "boolean") {
      if (body.transferable === current.transferable) {
        return Response.json(
          { error: `Transfers are already ${body.transferable ? "allowed" : "blocked"}` },
          { status: 409 }
        );
      }
      return Response.json(await setPassTransferable(address, body.transferable));
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    if (err?.shortMessage) return Response.json({ error: err.shortMessage }, { status: 502 });
    return handleAuthError(err);
  }
}
