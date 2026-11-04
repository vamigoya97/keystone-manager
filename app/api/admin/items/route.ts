import { handleAuthError, requireOperator } from "@/lib/auth";
import { ITEM_BATCH_ID_RE, type ChipSecurity, type ItemBatch } from "@/lib/keystones";
import { checkItemTokens } from "@/lib/items";
import { createItemBatch, getOperator } from "@/lib/store";

/** POST /api/admin/items { operatorId, id, name, tokens, chipSecurity } — create an item batch. */
export async function POST(req: Request) {
  try {
    await requireOperator(req);
    const body = (await req.json()) as {
      operatorId?: string;
      id?: string;
      name?: string;
      tokens?: string[];
      chipSecurity?: ChipSecurity;
    };
    const operator = body.operatorId ? await getOperator(body.operatorId) : undefined;
    if (!operator) return Response.json({ error: "Pick an operator" }, { status: 400 });
    const id = body.id?.trim().toLowerCase() ?? "";
    const name = body.name?.trim().slice(0, 80) ?? "";
    if (!ITEM_BATCH_ID_RE.test(id)) return Response.json({ error: "ID: lowercase letters, numbers and dashes" }, { status: 400 });
    if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
    const tokenError = await checkItemTokens(operator.id, body.tokens);
    if (tokenError) return Response.json({ error: tokenError }, { status: 400 });

    const batch: ItemBatch = {
      id,
      operatorId: operator.id,
      name,
      tokens: body.tokens!,
      chipSecurity: body.chipSecurity === "ntag424" ? "ntag424" : "static",
      createdAt: new Date().toISOString(),
    };
    await createItemBatch(batch);
    return Response.json(batch, { status: 201 });
  } catch (err: any) {
    if (err?.message?.includes("already exists")) return Response.json({ error: "That ID is taken" }, { status: 409 });
    return handleAuthError(err);
  }
}
