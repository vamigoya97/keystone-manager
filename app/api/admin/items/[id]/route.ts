import { handleAuthError, requireOperator } from "@/lib/auth";
import { getItemBatch, updateItemBatch } from "@/lib/store";
import { checkItemTokens } from "@/lib/items";

/**
 * PATCH /api/admin/items/:id { name?, tokens?, chipSecurity? }
 * Changing tokens takes effect on the next tap of items already handed out.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator(req);
    const { id } = await params;
    const batch = await getItemBatch(id);
    if (!batch) return Response.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json()) as { name?: string; tokens?: string[]; chipSecurity?: string };

    if (body.tokens !== undefined) {
      const tokenError = await checkItemTokens(batch.operatorId, body.tokens);
      if (tokenError) return Response.json({ error: tokenError }, { status: 400 });
    }
    if (body.chipSecurity !== undefined && body.chipSecurity !== "static" && body.chipSecurity !== "ntag424") {
      return Response.json({ error: "Chip type must be static or ntag424" }, { status: 400 });
    }

    const updated = await updateItemBatch(id, (b) => {
      if (body.name?.trim()) b.name = body.name.trim().slice(0, 80);
      if (body.tokens) b.tokens = body.tokens;
      if (body.chipSecurity === "static" || body.chipSecurity === "ntag424") b.chipSecurity = body.chipSecurity;
    });
    return Response.json(updated);
  } catch (err) {
    return handleAuthError(err);
  }
}
