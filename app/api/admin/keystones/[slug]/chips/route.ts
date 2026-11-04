import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { canonicalSlug } from "@/lib/store";
import { chipUrl } from "@/lib/tap";

/**
 * POST { prefix, start, count, baseUrl } → signed URLs to write onto chips,
 * e.g. prefix "GEN-", start 1, count 3 → GEN-0001 … GEN-0003.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    const { exp } = await requireKeystoneOperator(req, slug);

    const body = (await req.json()) as {
      prefix?: string;
      start?: number;
      count?: number;
      baseUrl?: string;
    };
    const prefix = (body.prefix ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
    const start = Math.max(0, Math.floor(Number(body.start) || 1));
    const count = Math.min(1000, Math.max(1, Math.floor(Number(body.count) || 1)));
    const baseUrl = body.baseUrl || new URL(req.url).origin;
    try {
      new URL(baseUrl);
    } catch {
      return Response.json({ error: "Base URL is not valid" }, { status: 400 });
    }

    const chips = Array.from({ length: count }, (_, i) => {
      const chipId = `${prefix}${String(start + i).padStart(4, "0")}`;
      return { chipId, url: chipUrl(exp, chipId, baseUrl) };
    });
    return Response.json({ chips });
  } catch (err: any) {
    if (err?.message?.includes("TAP_SECRET")) {
      return Response.json({ error: err.message }, { status: 500 });
    }
    return handleAuthError(err);
  }
}
