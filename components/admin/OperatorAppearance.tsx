"use client";

import { useRef, useState, type DragEvent } from "react";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import type { Keystone, Operator } from "@/lib/keystones";
import TokenCard from "@/components/nfc/TokenCard";
import { MEDIA_MAX_BYTES, VIDEO_MAX_SECONDS } from "@/lib/theme";
import { MediaView } from "@/components/nfc/themed";
import { Button, useAdminApi } from "./ui";
import { acceptFor, useMediaUpload } from "./MediaPicker";

const PHONE = "relative h-[460px] w-[252px] overflow-hidden rounded-[28px] bg-[#0E0E0E] shadow-[0_0_0_6px_#262626,0_0_0_7px_rgba(255,255,255,0.12)] [font-family:var(--font-plate),system-ui,sans-serif]";

/**
 * Operator-wide artwork, independent of the theme on any single keystone, as two
 * member previews that are also the editors: Main Menu (Operators) and this
 * operator's My Keystones page. Click or drop onto the circle for the round
 * icon, anywhere else for the background (shared by both pages).
 */
export default function OperatorAppearance({ operator, keystones, onSaved }: { operator: Operator; keystones: Omit<Keystone, "gallery">[]; onSaved: (op: Operator) => void }) {
  const api = useAdminApi();
  const [icon, setIcon] = useState(operator.appearance?.icon);
  const [background, setBackground] = useState(operator.appearance?.background);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const dirty = icon?.src !== operator.appearance?.icon?.src || background?.src !== operator.appearance?.background?.src;

  const endpoint = `/api/admin/operators/${encodeURIComponent(operator.id)}/media`;
  const iconUpload = useMediaUpload({ endpoint, slot: "icon", imageOnly: true }, (m) => { setIcon(m); setSaveError(""); });
  const bgUpload = useMediaUpload({ endpoint, slot: "background" }, (m) => { setBackground(m); setSaveError(""); });
  const error = iconUpload.error || bgUpload.error || saveError;

  async function save() {
    setBusy(true); setSaveError("");
    try {
      const updated = await api<Operator>(`/api/admin/operators/${encodeURIComponent(operator.id)}`, { method: "PATCH", json: { appearance: { icon: icon ?? null, background: background ?? null } } });
      onSaved(updated);
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Could not save appearance"); }
    finally { setBusy(false); }
  }
  function reset() {
    setIcon(operator.appearance?.icon); setBackground(operator.appearance?.background);
    setSaveError(""); iconUpload.setError(null); bgUpload.setError(null);
  }

  const status = error || (dirty ? "Unsaved changes" : "Saved");
  const statusTone = error ? "text-rose" : dirty ? "text-amber" : "text-muted-foreground";
  const actions = (
    <>
      <Button variant="primary" busy={busy} disabled={!dirty || iconUpload.busy || bgUpload.busy} onClick={save} className="flex-1">Save appearance</Button>
      <Button disabled={!dirty || busy} onClick={reset}>Reset</Button>
    </>
  );
  const backgroundSlot = (hint: string) => (
    <>
      {background && <MediaView media={background} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0E0E0E]/40 via-transparent to-[#0E0E0E]/90" />
      <DropTarget
        label="background"
        hasMedia={!!background}
        accept={acceptFor(false)}
        upload={bgUpload}
        onRemove={() => setBackground(undefined)}
        className="absolute inset-0"
        hintClassName={hint}
        removeClassName="right-3 top-3"
      />
    </>
  );

  return (
    <>
      <PreviewBlock id="appearance-main-menu" title="Main Menu Appearance" caption="Member preview · Operators" withIcon status={status} statusTone={statusTone} actions={actions}>
        {backgroundSlot("bottom-4 left-1/2 -translate-x-1/2")}
        {/* Round icon: sits over the background, like on Operators. */}
        <DropTarget
          label="round icon"
          hasMedia={!!icon}
          accept={acceptFor(true)}
          upload={iconUpload}
          onRemove={() => setIcon(undefined)}
          className="absolute left-1/2 top-[136px] size-[136px] -translate-x-1/2 rounded-full"
          hintClassName="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          removeClassName="-right-1 top-1"
        >
          <span className="flex size-full items-center justify-center overflow-hidden rounded-full border border-[#F2F2F0] bg-white/5">
            {icon && <MediaView media={icon} className="h-full w-full object-cover" />}
          </span>
        </DropTarget>
      </PreviewBlock>

      <PreviewBlock id="appearance-my-keystones" title="My Keystones Appearance" caption="Member preview · My Keystones" status={status} statusTone={statusTone} actions={actions}>
        {backgroundSlot("left-1/2 top-4 -translate-x-1/2")}
        {/* The page as members see it: one column of keystones, back arrow bottom left. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-14 bottom-0 flex flex-col items-center gap-4 overflow-hidden">
          {keystones.length === 0 ? (
            <p className="mt-16 px-6 text-center text-[12px] text-[#F2F2F0]/70">No keystones yet</p>
          ) : (
            keystones.slice(0, 3).map((k) => (
              <div key={k.slug} className="w-[186px] shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_6px_16px_-4px_rgba(0,0,0,0.14)]">
                <TokenCard keystone={k} />
              </div>
            ))
          )}
        </div>
        <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 flex size-8 items-center justify-center border border-[#F2F2F0] bg-black/30 text-[#F2F2F0]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
        </span>
      </PreviewBlock>
    </>
  );
}

/** Title and status, the phone, accepted files, then Save: one column. */
function PreviewBlock({ id, title, caption, withIcon = false, status, statusTone, actions, children }: { id: string; withIcon?: boolean; title: string; caption: string; status: string; statusTone: string; actions: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex w-fit flex-col gap-4 rounded-xl border bg-white/[0.03] p-5">
      <div className="flex w-[252px] items-baseline justify-between gap-3">
        <h2 id={id} className="text-[15px] font-semibold">{title}</h2>
        <span role="status" className={`text-xs ${statusTone}`}>{status}</span>
      </div>
      <figure className="flex flex-col items-center gap-2 pt-1.5">
        <div className={PHONE}>{children}</div>
        <figcaption className="flex w-[252px] flex-col items-center gap-1.5 text-center">
          <span className="text-xs text-muted-foreground">{caption}</span>
          <span className="text-[11px] leading-snug text-muted-foreground/80">
            {withIcon ? (
              <>
                Icon: PNG, JPG, WebP, GIF or AVIF
                <br />
                Background: same, or MP4/WebM up to {VIDEO_MAX_SECONDS}s
              </>
            ) : (
              <>Background: PNG, JPG, WebP, GIF, AVIF, or MP4/WebM up to {VIDEO_MAX_SECONDS}s</>
            )}
            <br />
            Up to {MEDIA_MAX_BYTES / (1024 * 1024)} MB each
          </span>
        </figcaption>
      </figure>
      <div className="flex w-[252px] gap-2">{actions}</div>
    </section>
  );
}

/**
 * One slot on the preview: click to pick a file, drop one on it, or remove what's there.
 * An empty slot always shows its upload label; a filled one shows it on hover or focus.
 */
function DropTarget({
  label,
  hasMedia,
  accept,
  upload,
  onRemove,
  className,
  hintClassName,
  removeClassName,
  children,
}: {
  label: string;
  hasMedia: boolean;
  accept: string;
  upload: ReturnType<typeof useMediaUpload>;
  onRemove: () => void;
  className: string;
  hintClassName: string;
  removeClassName: string;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) upload.upload(f);
  };
  return (
    <div
      className={`group/slot ${className}`}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
      onDragLeave={(e) => { e.stopPropagation(); setDragging(false); }}
      onDrop={drop}
    >
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload.upload(f); }} />
      <button
        type="button"
        disabled={upload.busy}
        onClick={() => input.current?.click()}
        aria-label={`${hasMedia ? "Replace" : "Upload"} ${label}`}
        className={`relative block size-full cursor-pointer rounded-[inherit] outline-offset-[-2px] disabled:cursor-wait ${dragging ? "outline-2 outline-dashed outline-white" : "hover:outline-1 hover:outline-dashed hover:outline-white/70 focus-visible:outline-2 focus-visible:outline-white"}`}
      >
        {children}
        <span
          className={`pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/70 px-2.5 py-1 font-sans text-[11px] font-medium text-white transition-opacity ${hintClassName} ${upload.busy || dragging || !hasMedia ? "opacity-100" : "opacity-0 group-hover/slot:opacity-100 group-focus-within/slot:opacity-100"}`}
        >
          {upload.busy ? <Loader2Icon className="size-3 animate-spin" /> : <UploadIcon className="size-3" />}
          {upload.busy ? "Uploading…" : dragging ? `Drop for ${label}` : `${hasMedia ? "Replace" : "Upload"} ${label}`}
        </span>
      </button>
      {hasMedia && !upload.busy && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className={`absolute z-10 flex size-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover/slot:opacity-100 ${removeClassName}`}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  );
}
