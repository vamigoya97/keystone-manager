import { handleAuthError, requireOperator } from "@/lib/auth";
import { getItemBatch } from "@/lib/store";
import { itemChipUrl } from "@/lib/tap";

/**
 * POST { prefix, start, count, baseUrl } → one unique signed link per item
 * (static chips), e.g. SAH-0001 … SAH-0300.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator(req);
    const batch = await getItemBatch((await params).id);
    if (!batch) return Response.json({ error: "Not found" }, { status: 404 });

    const body = (await req.json()) as { prefix?: string; start?: number; count?: number; baseUrl?: string };
    const prefix = (body.prefix ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
    const start = Math.max(0, Math.floor(Number(body.start) || 1));
    const count = Math.min(1000, Math.max(1, Math.floor(Number(body.count) || 1)));
    const baseUrl = body.baseUrl || new URL(req.url).origin;
    try {
      new URL(baseUrl);
    } catch {
      return Response.json({ error: "Base URL is not valid" }, { status: 400 });
    }

    const items = Array.from({ length: count }, (_, i) => {
      const chipId = `${prefix}${String(start + i).padStart(4, "0")}`;
      return { chipId, url: itemChipUrl(batch.id, chipId, baseUrl) };
    });
    return Response.json({ items });
  } catch (err: any) {
    if (err?.message?.includes("TAP_SECRET")) return Response.json({ error: err.message }, { status: 500 });
    return handleAuthError(err);
  }
}
