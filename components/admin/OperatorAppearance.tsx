"use client";

import GlowBars from "@/components/GlowBars";
import { useRef, useState, type DragEvent } from "react";
import { UploadIcon, XIcon } from "lucide-react";
import type { Keystone, Operator, ThemeMedia } from "@/lib/keystones";
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
 * icon, anywhere else for that page's background. Operators falls back to the
 * My Keystones background until it has one of its own.
 */
export default function OperatorAppearance({ operator, keystones, onSaved }: { operator: Operator; keystones: Omit<Keystone, "gallery">[]; onSaved: (op: Operator) => void }) {
  const api = useAdminApi();
  const [icon, setIcon] = useState(operator.appearance?.icon);
  const [background, setBackground] = useState(operator.appearance?.background);
  // Operators (Main Menu) background; when unset, Operators shows the My Keystones one.
  const [menuBackground, setMenuBackground] = useState(operator.appearance?.menuBackground);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saved = operator.appearance;
  const dirty = icon?.src !== saved?.icon?.src || background?.src !== saved?.background?.src || menuBackground?.src !== saved?.menuBackground?.src;

  const endpoint = `/api/admin/operators/${encodeURIComponent(operator.id)}/media`;
  const iconUpload = useMediaUpload({ endpoint, slot: "icon", imageOnly: true }, (m) => { setIcon(m); setSaveError(""); });
  const bgUpload = useMediaUpload({ endpoint, slot: "background" }, (m) => { setBackground(m); setSaveError(""); });
  const menuUpload = useMediaUpload({ endpoint, slot: "background" }, (m) => { setMenuBackground(m); setSaveError(""); });
  const error = iconUpload.error || bgUpload.error || menuUpload.error || saveError;

  async function save() {
    setBusy(true); setSaveError("");
    try {
      const updated = await api<Operator>(`/api/admin/operators/${encodeURIComponent(operator.id)}`, { method: "PATCH", json: { appearance: { icon: icon ?? null, background: background ?? null, menuBackground: menuBackground ?? null } } });
      onSaved(updated);
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Could not save appearance"); }
    finally { setBusy(false); }
  }
  function reset() {
    setIcon(saved?.icon); setBackground(saved?.background); setMenuBackground(saved?.menuBackground);
    setSaveError(""); iconUpload.setError(null); bgUpload.setError(null); menuUpload.setError(null);
  }

  const status = error || (dirty ? "Unsaved changes" : "Saved");
  const statusTone = error ? "text-rose" : dirty ? "text-amber" : "text-muted-foreground";
  const actions = (
    <>
      <Button variant="primary" busy={busy} disabled={!dirty || iconUpload.busy || bgUpload.busy || menuUpload.busy} onClick={save} className="flex-1">Save appearance</Button>
      <Button disabled={!dirty || busy} onClick={reset}>Reset</Button>
    </>
  );
  /** A preview's background: what members see, and the drop target that sets this page's own media. */
  const backgroundSlot = ({ shown, own, upload, onRemove, label, emptyHint, hint }: {
    shown?: ThemeMedia; own?: ThemeMedia; upload: ReturnType<typeof useMediaUpload>; onRemove: () => void; label: string; emptyHint?: string; hint: string;
  }) => (
    <>
      {shown && <MediaView key={shown.src} media={shown} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0E0E0E]/40 via-transparent to-[#0E0E0E]/90" />
      <DropTarget
        label={label}
        hasMedia={!!own}
        emptyHint={emptyHint}
        accept={acceptFor(false)}
        upload={upload}
        onRemove={onRemove}
        className="absolute inset-0"
        hintClassName={hint}
        removeClassName="right-3 top-3"
      />
    </>
  );

  return (
    <>
      <PreviewBlock id="appearance-main-menu" title="Main Menu Appearance" caption="Member preview · Operators" withIcon status={status} statusTone={statusTone} actions={actions}>
        {backgroundSlot({
          shown: menuBackground ?? background,
          own: menuBackground,
          upload: menuUpload,
          onRemove: () => setMenuBackground(undefined),
          label: "Operators background",
          // Nothing of its own yet: it borrows the My Keystones background.
          emptyHint: background ? "Same as My Keystones · Upload own" : undefined,
          hint: "bottom-4 left-1/2 -translate-x-1/2",
        })}
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
          <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.35),0_20px_50px_-10px_rgba(0,0,0,0.75)]">
            {icon && <MediaView media={icon} className="h-full w-full object-cover" />}
          </span>
        </DropTarget>
      </PreviewBlock>

      <PreviewBlock id="appearance-my-keystones" title="My Keystones Appearance" caption="Member preview · My Keystones" status={status} statusTone={statusTone} actions={actions}>
        {backgroundSlot({
          shown: background,
          own: background,
          upload: bgUpload,
          onRemove: () => setBackground(undefined),
          label: "My Keystones background",
          hint: "left-1/2 top-4 -translate-x-1/2",
        })}
        {/* The page as members see it: one column of keystones, back arrow bottom right. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-14 bottom-0 flex flex-col items-center gap-4 overflow-hidden">
          {keystones.length === 0 ? (
            <p className="mt-16 px-6 text-center text-[12px] text-[#F2F2F0]/70">No keystones yet</p>
          ) : (
            keystones.slice(0, 3).map((k) => (
              <div key={k.slug} className="w-[150px] shrink-0 overflow-hidden rounded-[7px] shadow-[0_2px_6px_rgba(0,0,0,0.22),0_14px_30px_-8px_rgba(0,0,0,0.6)]">
                <TokenCard keystone={k} />
              </div>
            ))
          )}
        </div>
        <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 flex size-8 items-center justify-center text-[#F2F2F0]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="size-5 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.55))_drop-shadow(0_3px_10px_rgba(0,0,0,0.45))]"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
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
  emptyHint,
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
  /** Shown instead of "Upload <label>" while the slot is empty. */
  emptyHint?: string;
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
          {upload.busy ? <GlowBars size="sm" decorative /> : <UploadIcon className="size-3" />}
          {upload.busy ? "Uploading…" : dragging ? `Drop for ${label}` : hasMedia ? `Replace ${label}` : emptyHint ?? `Upload ${label}`}
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
