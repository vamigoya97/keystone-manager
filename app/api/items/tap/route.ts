import { formatDates, itemChipId } from "@/lib/keystones";
import { getKeystone, getItemBatch, getOperator } from "@/lib/store";
import { setTapSession, verifyItemTap, type TapParams } from "@/lib/tap";

/**
 * POST /api/items/tap  { batch, c?, s?, picc_data?, cmac? }
 *
 * Called by the /t/<batch> landing page. Verifies the physical item once,
 * then opens a claim session for every token the item's batch unlocks (all
 * from the batch's operator). Returns those tokens in the batch's order.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as TapParams & { batch?: string };
  const batch = body.batch ? await getItemBatch(body.batch) : undefined;
  if (!batch) return Response.json({ error: "Unknown item" }, { status: 404 });

  const verdict = await verifyItemTap(batch, body);
  if (!verdict.ok) return Response.json({ error: verdict.error }, { status: verdict.status });

  // Same-operator tokens only, even if the batch was edited by hand.
  const tokens = (await Promise.all(batch.tokens.map((slug) => getKeystone(slug)))).filter(
    (e): e is NonNullable<typeof e> => !!e && e.operatorId === batch.operatorId
  );
  if (tokens.length === 0) return Response.json({ error: "This item doesn't unlock anything yet" }, { status: 409 });

  const chipId = itemChipId(batch.id, verdict.chipId);
  for (const t of tokens) await setTapSession(t.slug, chipId);

  const operator = await getOperator(batch.operatorId);
  return Response.json({
    operator: operator ? { id: operator.id, name: operator.name } : null,
    tokens: tokens.map((t) => ({
      slug: t.slug,
      name: t.name,
      dateLabel: formatDates(t) ?? null,
      location: t.location ?? null,
      palette: t.palette,
      tokenImage: t.tokenImage ?? null,
      symbol: t.token.symbol,
    })),
  });
}
