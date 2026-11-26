import { handleAuthError, requireOperator } from "@/lib/auth";
import { getOperator } from "@/lib/store";
import { createSignedUploadUrl } from "@/lib/pinata/upload";
import { MEDIA_MAX_BYTES, MEDIA_TYPES } from "@/lib/theme";

/**
 * POST { filename, type, size, slot } → { url, gateway }
 *
 * Returns a short-lived Pinata upload URL so the browser can send the
 * operator's icon/background straight to public IPFS, instead of through
 * this function — Vercel caps a Function's request body at 4.5 MB, well
 * under the 20 MB this upload allows.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOperator(req);
    const { id } = await params;
    if (!(await getOperator(id))) return Response.json({ error: "Operator not found" }, { status: 404 });

    const { filename, type, size, slot } = (await req.json()) as {
      filename?: string;
      type?: string;
      size?: number;
      slot?: string;
    };
    if (!type || !MEDIA_TYPES.includes(type) || (slot === "icon" && !type.startsWith("image/"))) {
      return Response.json({ error: "Use an image for icons; backgrounds also support MP4/WebM" }, { status: 400 });
    }
    if (typeof size !== "number" || size > MEDIA_MAX_BYTES) {
      return Response.json({ error: "Keep media under 20 MB" }, { status: 400 });
    }

    const { url, gateway } = await createSignedUploadUrl({
      filename: filename || "upload",
      mimeTypes: MEDIA_TYPES,
      maxBytes: MEDIA_MAX_BYTES,
      keyvalues: { operator: id, role: "operator-appearance", uploadedBy: user.userId },
    });
    return Response.json({ url, gateway });
  } catch (err) {
    return handleAuthError(err);
  }
}
