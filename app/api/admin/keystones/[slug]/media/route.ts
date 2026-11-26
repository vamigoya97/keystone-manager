import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { createSignedUploadUrl } from "@/lib/pinata/upload";
import { canonicalSlug } from "@/lib/store";
import { MEDIA_MAX_BYTES, MEDIA_TYPES } from "@/lib/theme";

/**
 * POST { filename, type, size } → { url, gateway }
 *
 * Returns a short-lived Pinata upload URL so the browser can send the
 * customization asset (image, GIF or short MP4/WebM loop) straight to
 * public IPFS, instead of through this function — Vercel caps a Function's
 * request body at 4.5 MB, well under the 20 MB this upload allows. These
 * are presentation assets shown before access is granted, so they're
 * public — gated photos stay on the private network. The browser then
 * POSTs the file to that URL and the operator saves the resulting media
 * into the theme via PATCH.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    const { user: operator } = await requireKeystoneOperator(req, slug);

    const { filename, type, size } = (await req.json()) as { filename?: string; type?: string; size?: number };
    if (!type || !MEDIA_TYPES.includes(type)) {
      return Response.json({ error: "Use PNG, JPG, WebP, GIF, AVIF, MP4 or WebM" }, { status: 400 });
    }
    if (typeof size !== "number" || size > MEDIA_MAX_BYTES) {
      return Response.json({ error: "Keep media under 20 MB" }, { status: 400 });
    }

    const { url, gateway } = await createSignedUploadUrl({
      filename: filename || "upload",
      mimeTypes: MEDIA_TYPES,
      maxBytes: MEDIA_MAX_BYTES,
      keyvalues: { keystone: slug, role: "theme", uploadedBy: operator.wallets[0] || operator.userId },
    });
    return Response.json({ url, gateway });
  } catch (err) {
    return handleAuthError(err);
  }
}
