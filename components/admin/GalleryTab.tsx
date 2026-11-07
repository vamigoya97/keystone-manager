"use client";

import { useMemo, useRef, useState } from "react";
import { GALLERY_LIMITS, GALLERY_TYPES, KIND_LABEL, QR_LIMITS, canBeWide, cleanQrUrl, formatDuration, uploadKind } from "@/lib/gallery";
import { galleryKind, type GalleryItem, type Keystone, type ThemeMedia } from "@/lib/keystones";
import { useAuthedFetch } from "@/lib/useAccess";
import { PlateVault, PlateViewer } from "@/components/nfc/plate";
import ArrangeGrid, { step, toggleWide } from "./ArrangeGrid";
import type { Detail } from "./AdminApp";
import MediaPicker from "./MediaPicker";
import PhonePreview from "./PhonePreview";
import { ArrowLeftIcon, ArrowRightIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { Button, Field, Notice, Panel, useAdminApi } from "./ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  const [qr, setQr] = useState({ url: "", label: "", text: "" });
  // The QR card whose front text is being edited.
  const [editing, setEditing] = useState<{ src: string; label: string; text: string } | null>(null);
  const [addingQr, setAddingQr] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);

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
      setQr({ url: "", label: "", text: "" });
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

  /** Change a QR card's label and front text, and save it. */
  async function patchItem(src: string, change: { label?: string; text?: string }) {
    setError(null);
    try {
      const exp = await api<Keystone>(`/api/admin/keystones/${keystone.slug}/images`, { method: "PATCH", json: { src, ...change } });
      onChange({ keystone: exp });
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }

  /** Save a new arrangement (order and full-width items) from the grid's drag and drop or arrow buttons. */
  async function arrange(next: GalleryItem[]) {
    onChange({ keystone: { ...keystone, gallery: next } });
    try {
      await api(`/api/admin/keystones/${keystone.slug}/images`, {
        method: "PUT",
        json: { order: next.map(keyOf), wide: next.filter((g) => g.wide).map(keyOf), rows: next.filter((g) => g.sameRow).map(keyOf) },
      });
    } catch (e: any) {
      setError(e.message);
      onChange();
    }
  }

  /** Arrow buttons and the width switch: rearrange, then save. */
  const rearrange = (next: GalleryItem[] | null) => next && arrange(next);

  /** Hover controls on each tile in the grid. */
  function controls(i: number) {
    const item = items[i];
    const kind = galleryKind(item);
    return (
      <>
        <Button className="h-7 bg-black/60 px-2 text-white" disabled={i === 0} onClick={() => rearrange(step(items, keyOf(item), -1))} aria-label="Move earlier">
          <ArrowLeftIcon />
        </Button>
        {canBeWide(item) && (
          <Button
            className="h-7 bg-black/60 px-2.5 text-white"
            aria-pressed={!!item.wide}
            title={item.wide ? "Back to half width" : "Span the vault's full width"}
            onClick={() => rearrange(toggleWide(items, keyOf(item)))}
          >
            {item.wide ? "Half width" : "Full width"}
          </Button>
        )}
        {kind === "qr" && (
          <Button className="h-7 bg-black/60 px-2.5 text-white" onClick={() => setEditing({ src: keyOf(item), label: item.alt, text: item.text ?? "" })}>
            Edit text
          </Button>
        )}
        <Button className="h-7 bg-black/60 px-2.5 text-white" onClick={() => setOpen(i)}>
          Preview
        </Button>
        <Button variant="danger" className="h-7 bg-black/60 px-2 text-white" onClick={() => remove(keyOf(item))} aria-label={`Remove ${item.alt}`}>
          <Trash2Icon />
        </Button>
        <Button className="h-7 bg-black/60 px-2 text-white" disabled={i === items.length - 1} onClick={() => rearrange(step(items, keyOf(item), 1))} aria-label="Move later">
          <ArrowRightIcon />
        </Button>
      </>
    );
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
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-ring bg-secondary/50" : "border-input hover:border-ring hover:bg-secondary/30"
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
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-ring border-t-transparent" />
              <p className="mt-3 text-sm text-muted-foreground">Uploading to IPFS… {uploading} left</p>
            </>
          ) : (
            <>
              <UploadIcon className="size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Drop photos, short clips or audio notes here, or click to upload</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Photos up to {GALLERY_LIMITS.image.bytes / MB} MB · clips up to {GALLERY_LIMITS.video.seconds} s and {GALLERY_LIMITS.video.bytes / MB} MB ·
                audio up to {GALLERY_LIMITS.audio.seconds / 60} min · stored privately, visible only to holders
              </p>
            </>
          )}
        </div>

        <Panel title="Add a QR code">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Field label="Link">
              <Input

                type="url"
                inputMode="url"
                placeholder="https://"
                value={qr.url}
                maxLength={QR_LIMITS.url}
                onChange={(e) => setQr((q) => ({ ...q, url: e.target.value }))}
              />
            </Field>
            <Field label="Label">
              <Input

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
          <div className="mt-3">
            <Field label="Front text" hint={`Optional, up to ${QR_LIMITS.text} characters`}>
              <Textarea
                className="h-20 resize-none py-2"
                placeholder="e.g. Show this at the door on night two for early entry."
                value={qr.text}
                maxLength={QR_LIMITS.text}
                onChange={(e) => setQr((q) => ({ ...q, text: e.target.value }))}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Holders see a card with the label and front text; tapping it turns it over to the code (with this keystone&apos;s artwork in the centre). In the viewer the back also has Open link. Links stay private to holders.
          </p>
        </Panel>

        {editing && (
          <Panel title="QR card text" action={<UiButton variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</UiButton>}>
            <div className="space-y-3">
              <Field label="Label">
                <Input

                  value={editing.label}
                  maxLength={QR_LIMITS.label}
                  onChange={(e) => setEditing((x) => x && { ...x, label: e.target.value })}
                />
              </Field>
              <Field label="Front text" hint={`Up to ${QR_LIMITS.text} characters; leave empty for the label only`}>
                <Textarea
                  className="h-20 resize-none py-2"
                  value={editing.text}
                  maxLength={QR_LIMITS.text}
                  onChange={(e) => setEditing((x) => x && { ...x, text: e.target.value })}
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  onClick={async () => {
                    if (await patchItem(editing.src, { label: editing.label, text: editing.text })) setEditing(null);
                  }}
                >
                  Save text
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {error && <Notice tone="bad">{error}</Notice>}
        {placeholders && <Notice tone="warn">These are placeholder photos. They&apos;ll be replaced by your first upload.</Notice>}

        <Panel
          title={items.length ? `${items.length} items${summary ? ` · ${summary}` : ""}` : "Vault"}
          action={
            items.length > 1 ? (
              <span className="text-xs text-muted-foreground">Drag beside an item to pair it, or between rows for full width</span>
            ) : undefined
          }
        >
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing in the vault yet.</p>
          ) : (
            <ArrangeGrid items={items} onArrange={arrange} controls={controls} />
          )}
        </Panel>
      </div>

      {/* ── Live preview ── */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-3 text-xs text-muted-foreground">Vault preview · tap an item</p>
        <PhonePreview>
          <div className="h-full overflow-y-auto">
            <PlateVault keystone={keystone} items={items} onOpen={setOpen} onSignOut={() => {}} contained />
          </div>
          {open !== null && items[open] && (
            <PlateViewer contained items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} logo={keystone.tokenImage} />
          )}
        </PhonePreview>
      </div>
    </div>
  );
}

