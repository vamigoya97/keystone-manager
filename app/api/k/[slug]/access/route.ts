import { getUser, handleAuthError } from "@/lib/auth";
import { checkAccess } from "@/lib/access";
import { resolveGallery } from "@/lib/pinata/private";
import { getKeystone } from "@/lib/store";

/**
 * GET /api/k/:slug/access   (Authorization: Bearer <privy token>)
 *
 * → { holder, revoked, gallery? } — gallery is only included for holders,
 * with private files as 1-hour signed URLs, so nobody else can see them.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const exp = await getKeystone((await params).slug);
    if (!exp) return Response.json({ error: "Unknown keystone" }, { status: 404 });

    const user = await getUser(req);
    const access = await checkAccess(exp, user);
    if (!access.holder) return Response.json(access);
    return Response.json({ ...access, gallery: await resolveGallery(exp.gallery) });
  } catch (err) {
    return handleAuthError(err);
  }
}
