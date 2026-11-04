import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { listMembers, removeMember, setMemberRevoked, canonicalSlug } from "@/lib/store";

/**
 * PATCH { address, action }
 *   revoke  → block gallery access (even if they still hold the token)
 *   restore → undo a revoke
 *   release → delete the record, freeing their chip for another wallet
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const { address, action } = (await req.json()) as { address?: string; action?: string };
    if (!address) return Response.json({ error: "address required" }, { status: 400 });

    const addr = address.toLowerCase();
    if (action === "revoke") await setMemberRevoked(slug, addr, true);
    else if (action === "restore") await setMemberRevoked(slug, addr, false);
    else if (action === "release") await removeMember(slug, addr);
    else return Response.json({ error: "Unknown action" }, { status: 400 });

    return Response.json({ members: await listMembers(slug) });
  } catch (err) {
    return handleAuthError(err);
  }
}
