import { handleAuthError, requireOperator } from "@/lib/auth";
import { DATE_RE, SLUG_RE, type Keystone } from "@/lib/keystones";
import { createKeystone, getOperator } from "@/lib/store";

/**
 * POST /api/admin/keystones { operatorId, slug, name, startDate?, endDate?, location? }
 *
 * Creates an empty keystone for an operator. Dates and location are optional;
 * without dates the keystone is ongoing.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      operatorId?: string;
      slug?: string;
      name?: string;
      startDate?: string;
      endDate?: string;
      location?: string;
    };
    await requireOperator(req);
    const operator = body.operatorId ? await getOperator(body.operatorId) : undefined;
    if (!operator) return Response.json({ error: "Pick an operator" }, { status: 400 });

    const slug = body.slug?.trim().toLowerCase() ?? "";
    const name = body.name?.trim() ?? "";
    if (!SLUG_RE.test(slug)) {
      return Response.json({ error: "URL name: lowercase letters, numbers and dashes only" }, { status: 400 });
    }
    if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
    if (body.startDate && !DATE_RE.test(body.startDate)) {
      return Response.json({ error: "Dates must be YYYY-MM-DD" }, { status: 400 });
    }
    if (body.endDate && (!body.startDate || !DATE_RE.test(body.endDate) || body.endDate < body.startDate)) {
      return Response.json({ error: "The end date needs a start date on or before it" }, { status: 400 });
    }

    const exp: Keystone = {
      slug,
      operatorId: operator.id,
      name,
      description: "",
      startDate: body.startDate || undefined,
      endDate: body.endDate || undefined,
      location: body.location?.trim().slice(0, 80) || undefined,
      palette: ["#C8FF2E", "#2EE6FF"],
      token: { standard: "erc721", symbol: slug.replace(/-/g, "").slice(0, 8).toUpperCase(), minBalance: "1" },
      gallery: [],
      createdAt: new Date().toISOString(),
    };
    await createKeystone(exp);
    return Response.json(exp, { status: 201 });
  } catch (err: any) {
    if (err?.message?.includes("already exists")) {
      return Response.json({ error: "That URL name is taken" }, { status: 409 });
    }
    return handleAuthError(err);
  }
}
