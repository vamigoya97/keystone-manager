import { randomBytes } from "crypto";
import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { QR_LIMITS, canBeWide, cleanQrText, cleanQrUrl, uploadKind } from "@/lib/gallery";
import type { GalleryItem } from "@/lib/keystones";
import { gatewayUrl } from "@/lib/pinata/upload";
import { deletePrivate, resolveGallery } from "@/lib/pinata/private";
import { getKeystone, updateKeystone, canonicalSlug } from "@/lib/store";

type Ctx = { params: Promise<{ slug: string }> };

type UploadedItem = { cid?: string; id?: string; type?: string; name?: string; width?: number; height?: number; duration?: number };

/** Placeholder photos (no file behind them) are dropped the first time real items arrive. */
const real = (g: GalleryItem) => !!g.cid || g.kind === "qr";

/**
 * POST JSON { kind: "qr", url, label, text? } adds a QR code for a link; `text` goes on the card's front.
 *
 * POST JSON { target: "gallery" | "token", items } saves files the browser already uploaded straight
 * to Pinata via a signed URL from `/images/sign` (Vercel caps a Function's request body at 4.5 MB, far
 * under what photos, clips and audio notes allow). `items` is `{ cid, id?, type, name, width, height,
 * duration? }[]`, one per uploaded file, in the same order sign requests were made. Gallery items went
 * to Pinata's private network (`id` set, holders get signed URLs); token art went public (no `id`).
 * Token art is one image, or a looping video (MP4/WebM ≤ 15 s) followed by its still frame as an image.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);

    const body = (await req.json().catch(() => ({}))) as {
      kind?: string;
      url?: unknown;
      label?: unknown;
      text?: unknown;
      target?: string;
      items?: UploadedItem[];
    };

    if (body.kind === "qr") {
      const url = cleanQrUrl(body.url);
      if (!url) return Response.json({ error: `Enter a full http(s) link, up to ${QR_LIMITS.url} characters` }, { status: 400 });
      const label = (typeof body.label === "string" ? body.label.trim() : "").slice(0, QR_LIMITS.label) || new URL(url).hostname;
      const text = cleanQrText(body.text);
      const item: GalleryItem = { kind: "qr", src: `qr:${randomBytes(6).toString("hex")}`, url, alt: label, width: 1, height: 1, ...(text ? { text } : {}) };
      const exp = await updateKeystone(slug, (e) => {
        e.gallery = [...e.gallery.filter(real), item];
      });
      return Response.json({ ...exp, gallery: await resolveGallery(exp.gallery) });
    }

    const target = body.target === "token" ? "token" : "gallery";
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return Response.json({ error: "No files" }, { status: 400 });
    const kinds = items.map((it) => (it.type ? uploadKind(it.type) : null));
    if (items.some((it, i) => !kinds[i] || !it.cid)) return Response.json({ error: "Upload failed" }, { status: 400 });
    if (target === "token") {
      const video = kinds[0] === "video";
      const ok = video ? items.length === 2 && kinds[1] === "image" && ["video/mp4", "video/webm"].includes(items[0].type!) : items.length === 1 && kinds[0] === "image";
      if (!ok) return Response.json({ error: "Artwork is one image, or an MP4/WebM loop with its still frame" }, { status: 400 });
    }

    const pinned: GalleryItem[] = items.map((it, i) => {
      const kind = kinds[i]!;
      const audio = kind === "audio";
      const base = {
        kind,
        alt: (it.name || "").replace(/\.[^.]+$/, ""),
        width: audio ? 1 : it.width || 1200,
        height: audio ? 1 : it.height || 1200,
        ...(kind !== "image" && it.duration ? { duration: Math.round(it.duration * 10) / 10 } : {}),
      };
      return target === "token"
        ? { ...base, src: gatewayUrl(it.cid!), cid: it.cid }
        : { ...base, src: `private:${it.cid}`, cid: it.cid, private: true, pinataId: it.id };
    });

    const exp = await updateKeystone(slug, (e) => {
      if (target === "token") {
        // A video comes first, then its still; an image replaces any earlier video.
        const [art, still] = pinned;
        const video = art.kind === "video";
        e.tokenImage = (video ? still : art).src;
        e.tokenImageCid = (video ? still : art).cid;
        e.tokenVideo = video ? art.src : undefined;
        e.tokenVideoCid = video ? art.cid : undefined;
      } else {
        e.gallery = [...e.gallery.filter(real), ...pinned];
      }
    });
    return Response.json({ ...exp, gallery: await resolveGallery(exp.gallery) });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * DELETE { src } → remove an item from the gallery. Private files are
 * deleted from Pinata too; public pins are left in place.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const { src } = (await req.json()) as { src?: string };
    const target = (await getKeystone(slug))?.gallery.find((g) => g.src === src);
    if (target?.private && target.pinataId) await deletePrivate(target.pinataId, target.cid);
    const exp = await updateKeystone(slug, (e) => {
      e.gallery = e.gallery.filter((g) => g.src !== src);
    });
    return Response.json({ ...exp, gallery: await resolveGallery(exp.gallery) });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PATCH { src, wide?, text?, label? } → change one item: span both vault
 * columns (landscape photos and clips, audio notes), or a QR card's front
 * text and label.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const body = (await req.json().catch(() => ({}))) as { src?: string; wide?: unknown; text?: unknown; label?: unknown };
    const item = (await getKeystone(slug))?.gallery.find((g) => g.src === body.src);
    if (!item) return Response.json({ error: "Item not found" }, { status: 404 });
    if (body.wide !== undefined && typeof body.wide !== "boolean") return Response.json({ error: "wide must be true or false" }, { status: 400 });
    if (body.wide && !canBeWide(item)) return Response.json({ error: "Only landscape photos and clips, and audio notes, can be full width" }, { status: 400 });
    const isQr = item.kind === "qr";
    if ((body.text !== undefined || body.label !== undefined) && !isQr) return Response.json({ error: "Only QR codes have card text" }, { status: 400 });

    const exp = await updateKeystone(slug, (e) => {
      const g = e.gallery.find((x) => x.src === body.src);
      if (!g) return;
      if (typeof body.wide === "boolean") {
        if (body.wide) g.wide = true;
        else delete g.wide;
      }
      if (isQr && body.text !== undefined) {
        const text = cleanQrText(body.text);
        if (text) g.text = text;
        else delete g.text;
      }
      if (isQr && typeof body.label === "string") {
        g.alt = body.label.trim().slice(0, QR_LIMITS.label) || g.alt;
      }
    });
    return Response.json({ ...exp, gallery: await resolveGallery(exp.gallery) });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PUT { order: src[], wide?: src[], rows?: src[] } → reorder the gallery. The
 * console's arranging also sends the layout: `wide` lists the full-width items
 * (ignored for items that can't be), `rows` the items that share a row with
 * the one before them; every other item starts a row.
 */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const slug = await canonicalSlug((await params).slug);
    await requireKeystoneOperator(req, slug);
    const { order, wide, rows } = (await req.json()) as { order?: string[]; wide?: string[]; rows?: string[] };
    if (!Array.isArray(order)) return Response.json({ error: "order required" }, { status: 400 });
    if (wide !== undefined && !Array.isArray(wide)) return Response.json({ error: "wide must be a list" }, { status: 400 });
    if (rows !== undefined && !Array.isArray(rows)) return Response.json({ error: "rows must be a list" }, { status: 400 });
    const exp = await updateKeystone(slug, (e) => {
      const rank = new Map(order.map((src, i) => [src, i]));
      e.gallery.sort((a, b) => (rank.get(a.src) ?? 1e9) - (rank.get(b.src) ?? 1e9));
      if (wide) {
        const set = new Set(wide);
        for (const g of e.gallery) {
          if (set.has(g.src) && canBeWide(g)) g.wide = true;
          else delete g.wide;
        }
      }
      if (rows) {
        const joined = new Set(rows);
        for (const g of e.gallery) g.sameRow = !g.wide && joined.has(g.src);
      }
    });
    return Response.json({ ...exp, gallery: await resolveGallery(exp.gallery) });
  } catch (err) {
    return handleAuthError(err);
  }
}
