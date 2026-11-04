"use client";

import { useMemo, useRef, useState } from "react";
import { GALLERY_LIMITS, GALLERY_TYPES, KIND_LABEL, QR_LIMITS, cleanQrUrl, formatDuration, uploadKind } from "@/lib/gallery";
import { galleryKind, type Keystone, type ThemeMedia } from "@/lib/keystones";
import { useAuthedFetch } from "@/lib/useAccess";
import { BackgroundLayer } from "@/components/nfc/themed";
import { GalleryGrid, GalleryHeader, GalleryTile, MediaViewer, tileAspect } from "@/components/nfc/views";
import type { Detail } from "./AdminApp";
import MediaPicker from "./MediaPicker";
import PhonePreview from "./PhonePreview";
import { Button, Field, Notice, Panel, inputClass, useAdminApi } from "./ui";

type Measured = { width: number; height: number; duration?: number };

/** Read pixel size (and length for clips and audio) in the browser so the vault can lay out without reflow. */
async function measure(file: File): Promise<Measured> {
  const kind = uploadKind(file.type);
  if (kind === "video" || kind === "audio") {
    return new Promise((resolve) => {
      const el = document.createElement(kind);
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(el.src);
        const duration = Number.isFinite(el.duration) ? el.duration : 0;
        const v = el as HTMLVideoElement;
        resolve(kind === "video" ? { width: v.videoWidth || 1080, height: v.videoHeight || 1920, duration } : { width: 1, height: 1, duration });
      };
      el.onerror = () => resolve({ width: 1080, height: 1080 });
      el.src = URL.createObjectURL(file);
    });
  }
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: 1200, height: 1200 };
  }
}

export async function uploadImages(
  authedFetch: ReturnType<typeof useAuthedFetch>,
  slug: string,
  files: File[],
  target: "gallery" | "token",
  sizes?: Measured[]
): Promise<Keystone> {
  const form = new FormData();
  form.append("target", target);
  files.forEach((f) => form.append("files", f));
  form.append("sizes", JSON.stringify(sizes ?? (await Promise.all(files.map(measure)))));
  const res = await authedFetch(`/api/admin/keystones/${slug}/images`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data as Keystone;
}

const ACCEPT = [...GALLERY_TYPES.image, ...GALLERY_TYPES.video, ...GALLERY_TYPES.audio].join(",");
const MB = 1024 * 1024;

/** Why a file can't go in the gallery, or null when it can. */
function rejection(file: File, size: Measured): string | null {
  const kind = uploadKind(file.type);
  if (!kind) return `${file.name}: use JPG, PNG, WebP, GIF, MP4, WebM, MOV, MP3, M4A, WAV or OGG`;
  const limit = GALLERY_LIMITS[kind];
  if (file.size > limit.bytes) return `${file.name} is over ${limit.bytes / MB} MB`;
  if ("seconds" in limit && (size.duration ?? 0) > limit.seconds + 0.5) {
    return `${file.name} is ${formatDuration(size.duration)} long; ${kind === "video" ? "clips" : "audio notes"} can be up to ${formatDuration(limit.seconds)}`;
  }
  return null;
}

/**
 * The keystone's vault: photos, short clips, audio notes and QR codes, all
 * private to holders. A live phone preview on the right shows the vault as
 * members see it; tap an item there to open the viewer.
 */
export default function GalleryTab({
  detail,
  onChange,
}: {
  detail: Detail;
  onChange: (next?: Partial<Detail>) => void;
}) {
  const { keystone } = detail;
  const api = useAdminApi();
  const authedFetch = useAuthedFetch();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState({ url: "", label: "" });
  const [addingQr, setAddingQr] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);
  // Drag and drop reordering: the tile being dragged and the one it's over.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const items = keystone.gallery;
  const placeholders = items.length > 0 && items.every((g) => !g.cid && g.kind !== "qr");
  const counts = useMemo(() => {
    const c = { image: 0, video: 0, audio: 0, qr: 0 };
    for (const g of items) c[galleryKind(g)]++;
    return c;
  }, [items]);

  async function upload(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    setError(null);
    const sizes = await Promise.all(files.map(measure));
    const problems = files.map((f, i) => rejection(f, sizes[i])).filter(Boolean);
    if (problems.length) return setError(problems.join(" · "));

    // Photos go up four at a time; clips and audio one by one, to keep each request small.
    const batches: { files: File[]; sizes: Measured[] }[] = [];
    files.forEach((f, i) => {
      const lastBatch = batches[batches.length - 1];
      if (uploadKind(f.type) === "image" && lastBatch && lastBatch.files.length < 4 && uploadKind(lastBatch.files[0].type) === "image") {
        lastBatch.files.push(f);
        lastBatch.sizes.push(sizes[i]);
      } else batches.push({ files: [f], sizes: [sizes[i]] });
    });

    let left = files.length;
    setUploading(left);
    try {
      let latest: Keystone | null = null;
      for (const b of batches) {
        latest = await uploadImages(authedFetch, keystone.slug, b.files, "gallery", b.sizes);
        left -= b.files.length;
        setUploading(left);
        onChange({ keystone: latest });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(0);
    }
  }

  async function addQr() {
    setError(null);
    if (!cleanQrUrl(qr.url)) return setError("Enter a full link starting with https://");
    setAddingQr(true);
    try {
      const exp = await api<Keystone>(`/api/admin/keystones/${keystone.slug}/images`, { method: "POST", json: { kind: "qr", ...qr } });
      onChange({ keystone: exp });
      setQr({ url: "", label: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddingQr(false);
    }
  }

  const keyOf = (g: { key?: string; src: string }) => g.key ?? g.src;

  /** Saves right away; the rest of the theme (Customize tab) is left as saved. */
  async function setBanner(m: ThemeMedia | undefined) {
    setError(null);
    setSavingBanner(true);
    try {
      const theme = { ...keystone.theme, gallery: m ? { banner: m } : undefined };
      const exp = await api<Keystone>(`/api/admin/keystones/${keystone.slug}`, { method: "PATCH", json: { theme } });
      onChange({ keystone: { ...exp, gallery: keystone.gallery } });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingBanner(false);
    }
  }

  async function remove(src: string) {
    setOpen(null);
    try {
      const exp = await api<Keystone>(`/api/admin/keystones/${keystone.slug}/images`, {
        method: "DELETE",
        json: { src },
      });
      onChange({ keystone: exp });
    } catch (e: any) {
      setError(e.message);
    }
  }

  /** Move the item at `from` to position `to` (arrow buttons and drag and drop), then save the order. */
  async function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;
    const order = items.map(keyOf);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    onChange({ keystone: { ...keystone, gallery: order.map((k) => items.find((g) => keyOf(g) === k)!) } });
    try {
      await api(`/api/admin/keystones/${keystone.slug}/images`, { method: "PUT", json: { order } });
    } catch (e: any) {
      setError(e.message);
      onChange();
    }
  }

  const summary = (Object.entries(counts) as [keyof typeof counts, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${KIND_LABEL[k].toLowerCase()}${n === 1 ? "" : "s"}`)
    .join(" · ");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
      {/* ── Content ── */}
      <div className="min-w-0 space-y-4">
        <Panel title="Banner">
          <Field
            label="Above the vault"
            hint={savingBanner ? "Saving…" : "Wide image or short looping video (3:1 works best). Saves right away; shows in the preview."}
          >
            <MediaPicker slug={keystone.slug} media={keystone.theme?.gallery?.banner} onChange={setBanner} />
          </Field>
        </Panel>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
          onClick={() => !uploading && input.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-accent bg-accent-glow" : "border-border-default hover:border-accent/40"
          }`}
        >
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) upload(e.target.files);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <>
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="mt-3 text-[13px] text-text-secondary">Uploading to IPFS… {uploading} left</p>
            </>
          ) : (
            <>
              <div className="text-2xl text-accent">＋</div>
              <p className="mt-2 text-[13px] font-medium">Drop photos, short clips or audio notes here, or click to upload</p>
              <p className="mt-1 text-[11px] text-text-muted">
                Photos up to {GALLERY_LIMITS.image.bytes / MB} MB · clips up to {GALLERY_LIMITS.video.seconds} s and {GALLERY_LIMITS.video.bytes / MB} MB ·
                audio up to {GALLERY_LIMITS.audio.seconds / 60} min · stored privately, visible only to holders
              </p>
            </>
          )}
        </div>

        <Panel title="Add a QR code">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Field label="Link">
              <input
                className={inputClass}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={qr.url}
                maxLength={QR_LIMITS.url}
                onChange={(e) => setQr((q) => ({ ...q, url: e.target.value }))}
              />
            </Field>
            <Field label="Label">
              <input
                className={inputClass}
                placeholder="e.g. Afterparty RSVP"
                value={qr.label}
                maxLength={QR_LIMITS.label}
                onChange={(e) => setQr((q) => ({ ...q, label: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addQr()}
              />
            </Field>
            <Button variant="primary" busy={addingQr} disabled={!qr.url.trim()} onClick={addQr}>
              Add QR code
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-text-muted">Holders see a scannable code with an Open link button. Links stay private to holders.</p>
        </Panel>

        {error && <Notice tone="bad">{error}</Notice>}
        {placeholders && <Notice tone="warn">These are placeholder photos. They&apos;ll be replaced by your first upload.</Notice>}

        <Panel
          title={items.length ? `${items.length} items${summary ? ` · ${summary}` : ""}` : "Vault"}
          action={items.length > 1 ? <span className="text-[11px] text-text-muted">Drag to reorder</span> : undefined}
        >
          {items.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-muted">Nothing in the vault yet.</p>
          ) : (
            // Same masonry as the vault: each item keeps its real shape.
            <div className="columns-2 gap-3">
              {items.map((item, i) => {
                const kind = galleryKind(item);
                return (
                  <figure
                    key={keyOf(item)}
                    title={`${i + 1} · ${item.alt} — drag to reorder`}
                    draggable
                    onDragStart={(e) => {
                      setDragFrom(i);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(i));
                    }}
                    onDragOver={(e) => {
                      if (dragFrom === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOver !== i) setDragOver(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom !== null) moveTo(dragFrom, i);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    className={`group relative mb-3 cursor-grab break-inside-avoid overflow-hidden rounded-2xl bg-surface-raised transition-opacity active:cursor-grabbing ${
                      dragFrom === i ? "opacity-40" : ""
                    } ${dragOver === i && dragFrom !== i ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-raised" : ""}`}
                    style={{ aspectRatio: tileAspect(item) }}
                  >
                    <GalleryTile item={item} palette={keystone.palette} eager={false} />
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/80 group-hover:opacity-0">
                      {KIND_LABEL[kind]}
                      {item.duration ? ` · ${formatDuration(item.duration)}` : ""}
                    </span>
                    {/* One compact row so even short, wide photos keep usable controls. */}
                    <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/55 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button className="h-7 bg-black/60 px-2" disabled={i === 0} onClick={() => moveTo(i, i - 1)} aria-label="Move earlier">
                        ←
                      </Button>
                      <Button className="h-7 bg-black/60 px-2.5" onClick={() => setOpen(i)}>
                        Preview
                      </Button>
                      <Button variant="danger" className="h-7 bg-black/60 px-2" onClick={() => remove(keyOf(item))} aria-label={`Remove ${item.alt}`}>
                        ✕
                      </Button>
                      <Button className="h-7 bg-black/60 px-2" disabled={i === items.length - 1} onClick={() => moveTo(i, i + 1)} aria-label="Move later">
                        →
                      </Button>
                    </div>
                  </figure>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Live preview ── */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-text-secondary">Vault preview · tap an item</p>
        <PhonePreview>
          <div className="h-full overflow-y-auto">
            <div className="relative min-h-full bg-surface">
              <BackgroundLayer media={keystone.theme?.background?.media} dim={55} />
              <div className="relative px-5 pb-10 pt-6">
                <GalleryHeader
                  keystone={keystone}
                  actions={<span className="px-3 py-1.5 text-[11px] text-white/75">Sign out</span>}
                />
                {items.length ? (
                  <GalleryGrid keystone={keystone} images={items} onOpen={setOpen} />
                ) : (
                  <p className="mt-10 text-center text-[13px] text-text-muted">Your uploads will appear here.</p>
                )}
              </div>
            </div>
          </div>
          {open !== null && items[open] && (
            <MediaViewer contained items={items} palette={keystone.palette} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
          )}
        </PhonePreview>
      </div>
    </div>
  );
}

