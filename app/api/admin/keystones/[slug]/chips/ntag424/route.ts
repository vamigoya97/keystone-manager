import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { ntagConfigured, provisioningSheet } from "@/lib/ntag424";
import { chipScopeOf } from "@/lib/keystones";
import { canonicalSlug } from "@/lib/store";

/**
 * GET /api/admin/keystones/:slug/chips/ntag424?baseUrl=https://…
 *
 * Programming sheet for NTAG 424 DNA chips: NDEF URL template, the three
 * AES keys for this keystone and the SDM offsets. Operator-only — the
 * keys are what make chips trustworthy, so handle the result like a secret.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    const { exp } = await requireKeystoneOperator(req, slug);
    if (!ntagConfigured()) {
      return Response.json(
        { error: "Set NTAG_MASTER_KEY (32 hex characters) on the server to use NTAG 424 DNA chips" },
        { status: 500 }
      );
    }

    const baseUrl = new URL(req.url).searchParams.get("baseUrl") || process.env.APP_URL || "";
    try {
      return Response.json(provisioningSheet(slug, baseUrl, { keyScope: chipScopeOf(exp), path: `/x/${slug}/tap` }));
    } catch (e: any) {
      return Response.json({ error: e.message || "Invalid base URL" }, { status: 400 });
    }
  } catch (err) {
    return handleAuthError(err);
  }
}
