import { handleAuthError, requireOperator } from "@/lib/auth";
import { itemKeyScope } from "@/lib/keystones";
import { ntagConfigured, provisioningSheet } from "@/lib/ntag424";
import { getItemBatch } from "@/lib/store";

/**
 * GET ?baseUrl=https://… → NTAG 424 DNA programming sheet for an item batch.
 * Every chip in the batch is programmed identically; each chip's UID makes
 * its taps unique. Operator-only — the keys are secrets.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator(req);
    const batch = await getItemBatch((await params).id);
    if (!batch) return Response.json({ error: "Not found" }, { status: 404 });
    if (!ntagConfigured()) {
      return Response.json({ error: "Set NTAG_MASTER_KEY (32 hex characters) on the server to use NTAG 424 DNA chips" }, { status: 500 });
    }
    const baseUrl = new URL(req.url).searchParams.get("baseUrl") || process.env.APP_URL || "";
    try {
      return Response.json(provisioningSheet(batch.id, baseUrl, { keyScope: itemKeyScope(batch.id), path: `/t/${batch.id}` }));
    } catch (e: any) {
      return Response.json({ error: e.message || "Invalid base URL" }, { status: 400 });
    }
  } catch (err) {
    return handleAuthError(err);
  }
}
