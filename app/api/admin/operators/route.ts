import { handleAuthError, requireOperator } from "@/lib/auth";
import { OPERATOR_ID_RE, type Operator } from "@/lib/keystones";
import { createOperator } from "@/lib/store";

/** POST /api/admin/operators { id, name } — add an operator (a creator, community or brand that issues keystones). */
export async function POST(req: Request) {
  try {
    await requireOperator(req);
    const body = (await req.json()) as { id?: string; name?: string };
    const id = body.id?.trim().toLowerCase() ?? "";
    const name = body.name?.trim().slice(0, 80) ?? "";
    if (!OPERATOR_ID_RE.test(id)) return Response.json({ error: "ID: lowercase letters, numbers and dashes" }, { status: 400 });
    if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
    const op: Operator = { id, name, createdAt: new Date().toISOString() };
    await createOperator(op);
    return Response.json(op, { status: 201 });
  } catch (err: any) {
    if (err?.message?.includes("already exists")) return Response.json({ error: "That ID is taken" }, { status: 409 });
    return handleAuthError(err);
  }
}
