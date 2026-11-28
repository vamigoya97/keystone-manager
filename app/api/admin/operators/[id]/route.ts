import { handleAuthError, requireOperator } from "@/lib/auth";
import { getOperator, updateOperator } from "@/lib/store";
import { sanitizeMedia } from "@/lib/theme";
import type { OperatorAppearance } from "@/lib/keystones";

const APPEARANCE_KEYS = ["icon", "background", "menuBackground"] as const;

/** Update only public presentation settings. Operator access uses the console allowlist. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator(req);
    const { id } = await params;
    if (!(await getOperator(id))) return Response.json({ error: "Operator not found" }, { status: 404 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const appearance = (body as { appearance?: unknown } | null)?.appearance;
    if (!appearance || typeof appearance !== "object" || Array.isArray(appearance)) return Response.json({ error: "Appearance is required" }, { status: 400 });
    const changes: Partial<Record<keyof OperatorAppearance, ReturnType<typeof sanitizeMedia> | null>> = {};
    for (const key of APPEARANCE_KEYS) {
      if (!(key in appearance)) continue;
      const value = (appearance as Record<string, unknown>)[key];
      if (value === null) { changes[key] = null; continue; }
      const media = sanitizeMedia(value);
      if (!media || (key === "icon" && media.kind !== "image")) return Response.json({ error: key === "icon" ? "Use an image for the operator icon" : "Use an HTTPS or IPFS image or video" }, { status: 400 });
      changes[key] = media;
    }
    const op = await updateOperator(id, (o) => {
      o.appearance ??= {};
      for (const key of APPEARANCE_KEYS) {
        if (!(key in changes)) continue;
        if (changes[key] === null) delete o.appearance[key];
        else o.appearance[key] = changes[key]!;
      }
    });
    return Response.json(op);
  } catch (err) { return handleAuthError(err); }
}
