import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { deployKeystonePass, estimatePassDeploy, type PassDeploy } from "@/lib/chain";
import { keystonePassContent } from "@/lib/passContent";
import { getKeystone, updateKeystone, canonicalSlug } from "@/lib/store";

/**
 * POST /api/admin/keystones/:slug/deploy   { freeze, transferable, estimateOnly? }
 *
 * Deploys a KeystonePass (ERC-721, operator-only minting, no price) from the
 * operator wallet. Everything it commits (name, symbol, description, image,
 * external_url, background_color, animation_url, attributes) is
 * built from the keystone's saved Details, so there's one source of truth.
 * Keystones are non-transferable (soulbound) unless `transferable: true` is sent.
 * With estimateOnly, returns the gas cost instead of deploying.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const exp = await getKeystone(slug);
    if (!exp) return Response.json({ error: "Not found" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const content = await keystonePassContent(exp, req);
    if ("error" in content) return Response.json({ error: content.error }, { status: 400 });

    const pass: PassDeploy = {
      ...content,
      freeze: body.freeze === true,
      // Soulbound by default; transfers need an explicit opt-in.
      transferable: body.transferable === true,
    };
    if (body.estimateOnly) {
      return Response.json({ estimate: await estimatePassDeploy(pass), image: pass.metadata.image });
    }

    const { address, hash, explorerUrl } = await deployKeystonePass(pass);
    const updated = await updateKeystone(slug, (e) => {
      e.token = { address, standard: "erc721", symbol: pass.symbol, minBalance: "1", deployTx: hash };
    });
    return Response.json({ keystone: updated, hash, explorerUrl });
  } catch (err: any) {
    if (err?.shortMessage) {
      return Response.json({ error: err.shortMessage }, { status: 502 });
    }
    return handleAuthError(err);
  }
}
