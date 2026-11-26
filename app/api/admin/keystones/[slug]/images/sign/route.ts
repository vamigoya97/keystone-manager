import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { GALLERY_LIMITS, uploadKind } from "@/lib/gallery";
import { MEDIA_MAX_BYTES, VIDEO_MAX_SECONDS } from "@/lib/theme";
import { createSignedUploadUrl } from "@/lib/pinata/upload";
import { canonicalSlug } from "@/lib/store";

const MB = 1024 * 1024;

/**
 * POST { filename, type, size, duration?, target } → { url, gateway, network }
 *
 * A short-lived Pinata upload URL for one gallery or token-art file, so
 * the browser can send it straight to IPFS instead of through this
 * function — Vercel caps a Function's request body at 4.5 MB, far under
 * what photos, clips and audio notes allow. Gallery files go to Pinata's
 * private network (holders get signed URLs); token art is public since
 * everyone sees the pass. `/images` (finalize) saves the result once the
 * browser has uploaded it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    const { user: operator } = await requireKeystoneOperator(req, slug);

    const { filename, type, size, duration, target } = (await req.json()) as {
      filename?: string;
      type?: string;
      size?: number;
      duration?: number;
      target?: string;
    };
    const isToken = target === "token";
    const kind = type ? uploadKind(type) : null;
    if (!kind || (isToken && kind !== "image" && !["video/mp4", "video/webm"].includes(type!))) {
      return Response.json(
        {
          error: isToken
            ? "Artwork is one image, or an MP4/WebM loop with its still frame"
            : `${filename ?? "This file"} isn't a supported photo, clip or audio file`,
        },
        { status: 400 }
      );
    }

    const limit = GALLERY_LIMITS[kind];
    const maxBytes = isToken ? MEDIA_MAX_BYTES : limit.bytes;
    if (typeof size !== "number" || size > maxBytes) {
      return Response.json({ error: `${filename ?? "This file"} is over ${maxBytes / MB} MB` }, { status: 400 });
    }
    const maxSeconds = isToken ? (kind === "video" ? VIDEO_MAX_SECONDS : undefined) : "seconds" in limit ? limit.seconds : undefined;
    if (maxSeconds !== undefined && (duration ?? 0) > maxSeconds + 0.5) {
      return Response.json({ error: `${filename ?? "This file"} is longer than ${maxSeconds} s` }, { status: 400 });
    }

    const { url, gateway } = await createSignedUploadUrl({
      filename: filename || "upload",
      mimeTypes: [type!],
      maxBytes,
      keyvalues: { keystone: slug, role: target || "gallery", uploadedBy: operator.wallets[0] || operator.userId },
      network: isToken ? "public" : "private",
    });
    return Response.json({ url, gateway, network: isToken ? "public" : "private" });
  } catch (err) {
    return handleAuthError(err);
  }
}
