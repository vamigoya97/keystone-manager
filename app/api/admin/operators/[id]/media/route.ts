import { handleAuthError, requireOperator } from "@/lib/auth";
import { getOperator } from "@/lib/store";
import { pinImage } from "@/lib/pinata/upload";
import { MEDIA_MAX_BYTES, MEDIA_TYPES } from "@/lib/theme";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOperator(req);
    const { id } = await params;
    if (!(await getOperator(id))) return Response.json({ error: "Operator not found" }, { status: 404 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    if (!MEDIA_TYPES.includes(file.type) || (form.get("slot") === "icon" && !file.type.startsWith("image/"))) return Response.json({ error: "Use an image for icons; backgrounds also support MP4/WebM" }, { status: 400 });
    if (file.size > MEDIA_MAX_BYTES) return Response.json({ error: "Keep media under 20 MB" }, { status: 400 });
    const { cid, url } = await pinImage(file, { operator: id, role: "operator-appearance", uploadedBy: user.userId });
    return Response.json({ src: url, cid, kind: file.type.startsWith("video/") ? "video" : "image" });
  } catch (err) { return handleAuthError(err); }
}
