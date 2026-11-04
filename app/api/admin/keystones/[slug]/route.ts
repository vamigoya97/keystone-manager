import { isAddress } from "viem";
import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { tokenStats } from "@/lib/chain";
import { DATE_RE } from "@/lib/keystones";
import { keystonePassContent } from "@/lib/passContent";
import { PASS_LIMITS, cleanTraits } from "@/lib/passMetadata";
import { resolveGallery } from "@/lib/pinata/private";
import { sanitizeTheme } from "@/lib/theme";
import { canonicalSlug, getKeystone, listMembers, renameKeystone, updateKeystone } from "@/lib/store";

type Ctx = { params: Promise<{ slug: string }> };

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * GET → full keystone (gallery with signed URLs), token stats, members,
 * and `pass`: the metadata it would commit on chain now (or the Details error).
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const exp = await getKeystone(slug);
    if (!exp) return Response.json({ error: "Not found" }, { status: 404 });

    const [stats, members, gallery, pass] = await Promise.all([
      tokenStats(exp.token).catch(() => null),
      listMembers(slug),
      resolveGallery(exp.gallery).catch(() => exp.gallery.map((g) => ({ ...g, key: g.src }))),
      keystonePassContent(exp, req),
    ]);
    return Response.json({ keystone: { ...exp, gallery }, tokenStats: stats, members, pass });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PATCH → update details and/or token settings. Only whitelisted fields
 * are applied; gallery images go through ./images. A new name moves the
 * token to the matching slug (old links keep redirecting); the response
 * carries the current slug.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const body = (await req.json()) as Record<string, any>;

    const str = (v: unknown, max = 500) =>
      typeof v === "string" ? v.trim().slice(0, max) : undefined;

    for (const k of ["startDate", "endDate"] as const) {
      if (body[k] && !DATE_RE.test(body[k])) {
        return Response.json({ error: "Dates must be YYYY-MM-DD" }, { status: 400 });
      }
    }
    if (body.endDate && !body.startDate) {
      return Response.json({ error: "Add a start date before an end date" }, { status: 400 });
    }
    const traits = body.traits === undefined ? undefined : cleanTraits(body.traits);
    if (traits && "error" in traits) return Response.json({ error: traits.error }, { status: 400 });
    if (body.startDate && body.endDate && body.endDate < body.startDate) {
      return Response.json({ error: "The end date can't be before the start date" }, { status: 400 });
    }
    if (body.palette && !(Array.isArray(body.palette) && body.palette.every((c: string) => HEX.test(c)))) {
      return Response.json({ error: "Colors must be #RRGGBB" }, { status: 400 });
    }
    if (body.chipSecurity !== undefined && !["static", "ntag424"].includes(body.chipSecurity)) {
      return Response.json({ error: "Chip security must be static or ntag424" }, { status: 400 });
    }
    const token = body.token as Record<string, any> | undefined;
    if (token?.address && !isAddress(token.address)) {
      return Response.json({ error: "Not a valid contract address" }, { status: 400 });
    }
    if (token?.standard && !["erc20", "erc721"].includes(token.standard)) {
      return Response.json({ error: "Standard must be ERC-20 or ERC-721" }, { status: 400 });
    }
    if (token?.minBalance !== undefined && !/^\d{1,40}$/.test(String(token.minBalance))) {
      return Response.json({ error: "Minimum balance must be a whole number" }, { status: 400 });
    }

    let renamed = false;
    const updated = await updateKeystone(slug, (e) => {
      const name = str(body.name, PASS_LIMITS.name);
      if (name && name !== e.name) {
        e.name = name;
        renamed = true;
      }
      if (body.description !== undefined) e.description = str(body.description, PASS_LIMITS.description) ?? "";
      // The symbol is fixed on chain once a contract is deployed from the console.
      if (body.symbol !== undefined && !e.token.deployTx) {
        const symbol = String(body.symbol).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, PASS_LIMITS.symbol);
        if (symbol) e.token.symbol = symbol;
      }
      if (body.startDate !== undefined) e.startDate = body.startDate || undefined;
      if (body.endDate !== undefined) e.endDate = body.endDate || undefined;
      if (!e.startDate) e.endDate = undefined;
      if (body.location !== undefined) e.location = str(body.location, 80) || undefined;
      if (traits) e.traits = traits.value.length ? traits.value : undefined;
      if (body.palette) e.palette = [body.palette[0], body.palette[1]];
      if (body.tokenImage === null) {
        e.tokenImage = undefined;
        e.tokenImageCid = undefined;
        e.tokenVideo = undefined;
        e.tokenVideoCid = undefined;
      }
      if (body.chipSecurity) e.chipSecurity = body.chipSecurity;
      // Replaces the whole theme; unknown keys and invalid values are dropped.
      if (body.theme !== undefined) e.theme = sanitizeTheme(body.theme);
      if (token) {
        if ("address" in token) e.token.address = token.address || undefined;
        if (token.standard) e.token.standard = token.standard;
        if (str(token.symbol, 12)) e.token.symbol = str(token.symbol, 12)!.toUpperCase();
        if (token.minBalance !== undefined) e.token.minBalance = String(token.minBalance);
      }
    });
    return Response.json(renamed ? await renameKeystone(updated.slug) : updated);
  } catch (err) {
    return handleAuthError(err);
  }
}
