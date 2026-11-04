import type { Address } from "viem";
import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { freezePassMetadata, readPassMetadata, setPassMetadata } from "@/lib/chain";
import { keystonePassContent } from "@/lib/passContent";
import { getKeystone, canonicalSlug } from "@/lib/store";

/**
 * POST /api/admin/keystones/:slug/metadata
 *   { action: "update" }   write the keystone's current metadata (built from its
 *                          saved Details, artwork, links and attributes) to the contract
 *   { action: "freeze" }   lock the on-chain metadata forever
 *
 * Gas is paid by the operator wallet. Name and symbol are fixed at deploy.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const exp = await getKeystone(slug);
    if (!exp) return Response.json({ error: "Not found" }, { status: 404 });
    if (!exp.token.address) {
      return Response.json({ error: "No contract deployed yet" }, { status: 400 });
    }

    const address = exp.token.address as Address;
    const current = await readPassMetadata(address);
    if (!current) {
      return Response.json(
        { error: "This contract doesn't support on-chain metadata (not a KeystonePass)" },
        { status: 400 }
      );
    }
    if (current.frozen) {
      return Response.json({ error: "Metadata is locked permanently" }, { status: 409 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.action === "freeze") {
      return Response.json(await freezePassMetadata(address));
    }

    if (body.action === "update") {
      const content = await keystonePassContent(exp, req);
      if ("error" in content) return Response.json({ error: content.error }, { status: 400 });

      const result = await setPassMetadata(address, { ...content.metadata, image: content.metadata.image || current.image });
      return Response.json(result);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    if (err?.shortMessage) {
      return Response.json({ error: err.shortMessage }, { status: 502 });
    }
    return handleAuthError(err);
  }
}
