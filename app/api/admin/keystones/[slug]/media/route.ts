import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { pinImage } from "@/lib/pinata/upload";
import { getKeystone, canonicalSlug } from "@/lib/store";
import { MEDIA_MAX_BYTES, MEDIA_TYPES } from "@/lib/theme";

/**
 * POST multipart { file } → { src, cid, kind }
 *
 * Uploads a customization asset (image, GIF or short MP4/WebM loop) to
 * public IPFS. These are presentation assets shown before access is
 * granted, so they're public — gated photos stay on the private network.
 * The operator then saves the returned media into the theme via PATCH.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    const { user: operator } = await requireKeystoneOperator(req, slug);
    if (!(await getKeystone(slug))) return Response.json({ error: "Not found" }, { status: 404 });

    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    if (!MEDIA_TYPES.includes(file.type)) {
      return Response.json({ error: "Use PNG, JPG, WebP, GIF, AVIF, MP4 or WebM" }, { status: 400 });
    }
    if (file.size > MEDIA_MAX_BYTES) {
      return Response.json({ error: "Keep media under 20 MB" }, { status: 400 });
    }

    const { cid, url } = await pinImage(file, {
      keystone: slug,
      role: "theme",
      uploadedBy: operator.wallets[0] || operator.userId,
    });
    return Response.json({ src: url, cid, kind: file.type.startsWith("video/") ? "video" : "image" });
  } catch (err) {
    return handleAuthError(err);
  }
}
