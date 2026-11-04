import { getKeystone } from "@/lib/store";
import { setTapSession, verifyTapRequest, type TapParams } from "@/lib/tap";

/**
 * POST /api/tap  { slug, c?, s?, picc_data?, cmac? }
 *
 * Called by the tap landing page. Verifies the chip (static signed link or
 * NTAG 424 DNA SUN message, per the keystone's chip security) and starts
 * a tap session (httpOnly cookie) that authorizes claiming the token.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as TapParams & { slug?: string };
  const exp = body.slug ? await getKeystone(body.slug) : undefined;
  if (!exp) return Response.json({ error: "Unknown item" }, { status: 404 });

  const verdict = await verifyTapRequest(exp, body);
  if (!verdict.ok) return Response.json({ error: verdict.error }, { status: verdict.status });

  await setTapSession(exp.slug, verdict.chipId);
  return Response.json({ ok: true });
}
