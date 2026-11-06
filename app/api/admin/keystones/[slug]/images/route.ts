import { randomBytes } from "crypto";
import { handleAuthError, requireKeystoneOperator } from "@/lib/auth";
import { GALLERY_LIMITS, QR_LIMITS, canBeWide, cleanQrText, cleanQrUrl, uploadKind } from "@/lib/gallery";
import { MEDIA_MAX_BYTES, VIDEO_MAX_SECONDS } from "@/lib/theme";
import type { GalleryItem } from "@/lib/keystones";
import { pinImage } from "@/lib/pinata/upload";
import { deletePrivate, resolveGallery, uploadPrivate } from "@/lib/pinata/private";
import { getKeystone, updateKeystone, canonicalSlug } from "@/lib/store";

type Ctx = { params: Promise<{ slug: string }> };

const MB = 1024 * 1024;

/** Placeholder photos (no file behind them) are dropped the first time real items arrive. */
const real = (g: GalleryItem) => !!g.cid || g.kind === "qr";

/**
 * POST multipart:
 *   target = "gallery" | "token"
 *   files  = one or more photos, short clips (≤ 60 s) or audio notes (≤ 10 min). Token art is one
 *            image, or a looping video (MP4/WebM ≤ 15 s) followed by its still frame as an image
 *   sizes  = JSON [{ width, height, duration? }] in the same order (measured in the browser)
 * Gallery files go to Pinata's private network (holders get signed URLs);
 * token art is pinned publicly since everyone sees the pass.
 *
 * POST JSON { kind: "qr", url, label, text? } adds a QR code for a link; `text` goes on the card's front.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const slug = await canonicalSlug((await params).slug);
    const { user: operator } = await requireKeystoneOperator(req, slug);
    if (!(await getKeystone(slug))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as { kind?: string; url?: unknown; label?: unknown; text?: unknown };
      if (body.kind !== "qr") return Response.json({ error: "Unknown item" }, { status: 400 });
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

    const form = await req.formData();
    const target = form.get("target") === "token" ? "token" : "gallery";
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const sizes = JSON.parse(String(form.get("sizes") || "[]")) as { width: number; height: number; duration?: number }[];

    if (files.length === 0) return Response.json({ error: "No files" }, { status: 400 });
    const kinds = files.map((f) => uploadKind(f.type));
    if (target === "token") {
      const video = kinds[0] === "video";
      const ok = video ? files.length === 2 && kinds[1] === "image" && ["video/mp4", "video/webm"].includes(files[0].type) : files.length === 1 && kinds[0] === "image";
      if (!ok) return Response.json({ error: "Artwork is one image, or an MP4/WebM loop with its still frame" }, { status: 400 });
      if (video && (files[0].size > MEDIA_MAX_BYTES || (sizes[0]?.duration ?? 0) > VIDEO_MAX_SECONDS + 0.5)) {
        return Response.json({ error: `Looping artwork must be up to ${VIDEO_MAX_SECONDS} s and ${MEDIA_MAX_BYTES / MB} MB` }, { status: 400 });
      }
    }
    for (const [i, f] of files.entries()) {
      const kind = kinds[i];
      if (!kind) return Response.json({ error: `${f.name} isn't a supported photo, clip or audio file` }, { status: 400 });
      const limit = GALLERY_LIMITS[kind];
      if (f.size > limit.bytes) {
        return Response.json({ error: `${f.name} is over ${limit.bytes / MB} MB` }, { status: 400 });
      }
      if ("seconds" in limit && (sizes[i]?.duration ?? 0) > limit.seconds + 0.5) {
        return Response.json({ error: `${f.name} is longer than ${limit.seconds >= 60 ? `${limit.seconds / 60} min` : `${limit.seconds} s`}` }, { status: 400 });
      }
    }

    const pinned: GalleryItem[] = [];
    for (const [i, file] of files.entries()) {
      const kind = kinds[i]!;
      const meta = {
        keystone: slug,
        role: target,
        uploadedBy: operator.wallets[0] || operator.userId,
      };
      const audio = kind === "audio";
      const base = {
        kind,
        alt: file.name.replace(/\.[^.]+$/, ""),
        width: audio ? 1 : sizes[i]?.width || 1200,
        height: audio ? 1 : sizes[i]?.height || 1200,
        ...(kind !== "image" && sizes[i]?.duration ? { duration: Math.round(sizes[i].duration! * 10) / 10 } : {}),
      };
      if (target === "token") {
        const { cid, url } = await pinImage(file, meta);
        pinned.push({ ...base, src: url, cid });
      } else {
        const { id, cid } = await uploadPrivate(file, meta);
        pinned.push({ ...base, src: `private:${cid}`, cid, private: true, pinataId: id });
      }
    }

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
