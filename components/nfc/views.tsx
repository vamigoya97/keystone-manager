"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { galleryKind, type GalleryItem, type PublicKeystone } from "@/lib/keystones";
import { KIND_LABEL, formatDuration } from "@/lib/gallery";
import type { AccessStatus } from "@/lib/useAccess";
import { resolveTheme } from "@/lib/theme";
import ClaimShell from "./ClaimShell";
import { NfcGlyph } from "./NfcGlyph";
import QrCode from "./QrCode";
import TokenCard from "./TokenCard";
import { CelebrationLayer, MediaView } from "./themed";

/**
 * Presentational views for the member steps. They take state as props and
 * render the operator's customization; the live pages (TokenClaim, Gallery)
 * add behaviour, and the Customize tab previews them with sample state.
 */

type ViewKeystone = Omit<PublicKeystone, "galleryCount"> & { galleryCount?: number };

// ── Claim / mint ─────────────────────────────────────────────────

export type MintPhase = "idle" | "minting" | "minted" | "error";

/**
 * Where this visitor's claim session stands: a chip tap still being checked
 * or rejected, verified by a chip, or none at all.
 */
export type ClaimAccess = "verifying" | "failed" | "chip" | null;

/**
 * The claim screen: the operator's background media full-bleed, the keystone
 * artwork over it, and the forge (mint) button, which only appears once the
 * item is verified.
 */
export function ClaimView({
  keystone,
  status,
  access,
  phase,
  error,
  onClaim,
  onEnter,
  contained = false,
}: {
  keystone: ViewKeystone;
  status: AccessStatus;
  access: ClaimAccess;
  phase: MintPhase;
  error?: string | null;
  onClaim?: () => void;
  onEnter?: () => void;
  contained?: boolean;
}) {
  const t = resolveTheme(keystone).claim;
  const s = t.style;
  const column = { width: "100%", maxWidth: 340 };
  const artWidth = { width: "100%", maxWidth: Math.round((340 * s.artwork.size) / 100) };
  // Ready, forging and forged stay clean: no button, badge or alert — just the artwork.
  const forging = phase === "minting" || phase === "minted";
  const holder = status === "holder" && !forging;
  const ready = forging || (!holder && status !== "revoked" && status !== "loading" && access === "chip");
  const canForge = ready && !forging && !!onClaim;
  const tap = useDoubleTap(canForge ? onClaim : undefined);

  return (
    <ClaimShell keystone={keystone} contained={contained} dim={s.dim} background={s.backgroundColor}>
      {phase === "minted" && <CelebrationLayer palette={keystone.palette} absolute={contained} />}

      <div
        className={`flex flex-1 flex-col items-center py-6 ${
          s.artwork.position === "top" ? "justify-start" : s.artwork.position === "bottom" ? "justify-end" : "justify-center"
        }`}
      >
        {/* Space is kept for the alert so the artwork doesn't shift when it comes and goes. */}
        <div aria-live="polite" className="mb-3 flex h-6 items-center" style={artWidth}>
          {access === "verifying" && (
            <span
              role="status"
              className={`pop flex items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[11px] font-medium backdrop-blur-md ${s.alerts.background ? "" : "bg-black/55"} ${
                s.alerts.color ? "" : "text-white/90"
              }`}
              style={{ backgroundColor: s.alerts.background, color: s.alerts.color }}
            >
              <Spinner className="h-3 w-3 border-[1.5px]" />
              {t.verifying}
            </span>
          )}
        </div>
        <div
          {...tap.handlers}
          style={artWidth}
          className={`rise relative transition-transform duration-150 ${canForge ? "cursor-pointer touch-manipulation select-none" : ""} ${
            tap.pressed ? "scale-[0.97]" : phase === "minting" ? "animate-pulse" : ""
          }`}
        >
          <div
            className="overflow-hidden"
            style={{
              borderRadius: s.artwork.radius,
              border: s.artwork.borderWidth ? `${s.artwork.borderWidth}px solid ${s.artwork.borderColor}` : undefined,
              boxShadow: s.artwork.shadow ? "0 30px 80px -20px rgba(0,0,0,0.85)" : "none",
            }}
          >
            <TokenCard keystone={keystone} />
          </div>
          {holder && (
            <span className="pop absolute right-4 top-4 rounded-full bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-surface">
              Owned
            </span>
          )}
        </div>
        {keystone.description && (
          <p
            className={`rise mt-5 whitespace-pre-line leading-relaxed [text-shadow:0_1px_10px_rgba(0,0,0,0.7)] ${s.text.color ? "" : "text-white/80"}`}
            style={{ ...column, animationDelay: "80ms", fontSize: s.text.size, color: s.text.color, textAlign: s.text.align }}
          >
            {keystone.description}
          </p>
        )}
      </div>

      <div aria-live="polite" className="min-h-[120px]">
        {ready ? (
          <ForgeHint status={status} phase={phase} error={error} labels={t} onClaim={onClaim} />
        ) : (
          <>
            <ClaimAction status={status} holder={holder} access={access} error={error} labels={t} onEnter={onEnter} />
            <div className="mt-3 min-h-[24px] text-center text-xs">
              {status === "revoked" ? (
                <Note className="text-rose">Your access to this keystone was revoked.</Note>
              ) : error && access !== "failed" ? (
                <Note className="text-rose">{error}</Note>
              ) : null}
            </div>
          </>
        )}
      </div>
    </ClaimShell>
  );
}

/**
 * Double-tap (or double-click) detection for the artwork. A second tap within
 * 320 ms and 24 px of the first fires; a scroll cancels the pointer, so it never
 * counts. Phones that support it get a light haptic tick.
 */
function useDoubleTap(onDouble?: () => void) {
  const last = useRef<{ t: number; x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  if (!onDouble) return { pressed: false, handlers: {} };
  return {
    pressed,
    handlers: {
      onPointerUp: (e: React.PointerEvent) => {
        const prev = last.current;
        setPressed(true);
        setTimeout(() => setPressed(false), 140);
        if (prev && e.timeStamp - prev.t < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 24) {
          last.current = null;
          navigator.vibrate?.([12, 40, 12]);
          onDouble();
        } else {
          last.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
          navigator.vibrate?.(8);
        }
      },
    },
  };
}

/**
 * Under the artwork while the keystone can be forged: a quiet double-tap hint
 * (no button). Forging shows only a small spinner, forged only a check. A
 * screen-reader button keeps it usable without a double-tap.
 */
function ForgeHint({
  status,
  phase,
  error,
  labels,
  onClaim,
}: {
  status: AccessStatus;
  phase: MintPhase;
  error?: string | null;
  labels: ReturnType<typeof resolveTheme>["claim"];
  onClaim?: () => void;
}) {
  if (phase === "minting") {
    return (
      <div className="flex justify-center pt-4 text-white/70" role="status">
        <Spinner className="h-5 w-5 border-2" />
        <span className="sr-only">{labels.minting}</span>
      </div>
    );
  }
  if (phase === "minted") {
    return (
      <div className="flex justify-center pt-3" role="status">
        <svg viewBox="0 0 24 24" className="pop h-8 w-8 text-white/85" fill="none" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">{labels.minted}</span>
      </div>
    );
  }
  const hint = phase === "error" ? labels.doubleTapRetry : status === "signed-out" ? labels.doubleTapSecure : labels.doubleTapForge;
  return (
    <div className="flex flex-col items-center gap-3 pt-2 text-center">
      {phase === "error" && error && <Note className="text-rose">{error}</Note>}
      <p
        className={`rise flex items-center gap-2.5 text-[13px] [text-shadow:0_1px_8px_rgba(0,0,0,0.7)] ${labels.style.alerts.color ? "" : "text-white/75"}`}
        style={{ color: labels.style.alerts.color }}
      >
        <span aria-hidden className="relative flex h-5 w-5 items-center justify-center">
          <span className="tap-ring" />
          <span className="tap-ring" />
          <span className="h-2 w-2 rounded-full bg-white/80" />
        </span>
        {hint}
      </p>
      <button onClick={onClaim} className="sr-only">
        {status === "signed-out" ? labels.claimButton : labels.mintButton}
      </button>
    </div>
  );
}

/** Small text that stays legible over any background media. */
function Note({ children, className = "text-text-secondary" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-block rounded-full bg-black/45 px-3 py-1 backdrop-blur-md ${className}`}>{children}</span>;
}

/** The action under the artwork when the keystone isn't ready to forge. */
function ClaimAction({
  status,
  holder,
  access,
  error,
  labels,
  onEnter,
}: {
  status: AccessStatus;
  holder: boolean;
  access: ClaimAccess;
  error?: string | null;
  labels: ReturnType<typeof resolveTheme>["claim"];
  onEnter?: () => void;
}) {
  const base =
    "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold tracking-wide transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed";
  const quiet = `${base} glass-elevated cursor-default text-text-secondary`;

  if (holder) {
    return (
      <button onClick={onEnter} className={`${base} pop bg-accent text-surface hover:brightness-110`}>
        {labels.enterButton}
        <span aria-hidden>→</span>
      </button>
    );
  }
  if (status === "revoked") return <div className={`${quiet} text-text-muted`}>Access revoked</div>;
  // Aligning shows as an alert above the artwork; the hint arrives once it's done.
  if (access === "verifying") return null;
  if (access === "failed") {
    return (
      <div className="glass-elevated rounded-2xl px-4 py-3 text-center">
        <p className="text-sm text-rose">{labels.failedCustom || error || labels.failed}</p>
        <p className="mt-1 text-xs text-text-muted">Hold your phone to the item again to retry.</p>
      </div>
    );
  }
  if (access === null) {
    return (
      <div className={quiet}>
        <NfcGlyph className="h-5 w-5 text-accent" />
        Tap your item to secure
      </div>
    );
  }
  return (
    <div className={quiet}>
      <Spinner />
    </div>
  );
}

function Spinner({ className = "h-4 w-4 border-2" }: { className?: string }) {
  return <span className={`animate-spin rounded-full border-current border-t-transparent ${className}`} />;
}

// ── Gallery ──────────────────────────────────────────────────────

/**
 * Top of the gallery: the operator's banner with no title text. Member
 * actions (sign out) sit over the banner's corner, or on their own row
 * when there's no banner.
 */
export function GalleryHeader({ keystone, actions }: { keystone: ViewKeystone; actions?: ReactNode }) {
  const banner = resolveTheme(keystone).gallery.banner;
  const overlay = actions ? <div className="flex items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur-md">{actions}</div> : null;
  if (!banner) return overlay ? <div className="rise flex justify-end">{overlay}</div> : null;
  return (
    <div className="rise relative -mx-5 -mt-6 aspect-[3/1] overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-3xl">
      <MediaView media={banner} className="h-full w-full object-cover" />
      {overlay && <div className="absolute right-3 top-3">{overlay}</div>}
    </div>
  );
}

export function GalleryGrid({
  keystone,
  images,
  onOpen,
}: {
  keystone: ViewKeystone;
  images: GalleryItem[];
  onOpen?: (index: number) => void;
}) {
  return (
    <div className="mt-6 columns-2 gap-3">
      {images.map((item, i) => (
        <button
          key={item.key ?? item.src}
          onClick={() => onOpen?.(i)}
          className="rise group relative mb-3 block w-full overflow-hidden rounded-2xl bg-surface-raised focus-visible:outline-offset-4"
          style={{ aspectRatio: tileAspect(item), animationDelay: `${Math.min(i, 12) * 45}ms` }}
          aria-label={`Open ${KIND_LABEL[galleryKind(item)].toLowerCase()}: ${item.alt}`}
        >
          <GalleryTile item={item} palette={keystone.palette} eager={i < 6} />
        </button>
      ))}
    </div>
  );
}

/** Masonry shape: photos and clips keep their own; audio notes and QR codes use fixed cards. */
export function tileAspect(item: GalleryItem): string {
  const kind = galleryKind(item);
  if (kind === "audio") return "4 / 3";
  if (kind === "qr") return "4 / 5";
  return `${item.width} / ${item.height}`;
}

const zoom = "transition-transform duration-500 group-hover:scale-[1.03]";

export function GalleryTile({ item, palette, eager }: { item: GalleryItem; palette: [string, string]; eager: boolean }) {
  const kind = galleryKind(item);
  if (kind === "video") {
    return (
      <>
        <video src={`${item.src}#t=0.1`} muted playsInline preload="metadata" className={`h-full w-full object-cover ${zoom}`} />
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-md">
          <PlayIcon className="h-2.5 w-2.5" /> {formatDuration(item.duration) || "Clip"}
        </span>
      </>
    );
  }
  if (kind === "audio") {
    return (
      <div
        className="flex h-full w-full flex-col justify-between p-3 text-left"
        style={{ background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white">
          <WaveIcon className="h-4 w-4" />
        </span>
        <span>
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">{item.alt}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-white/75">
            Audio note{item.duration ? ` · ${formatDuration(item.duration)}` : ""}
          </span>
        </span>
      </div>
    );
  }
  if (kind === "qr") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-white p-3">
        <QrCode url={item.url ?? ""} className="aspect-square w-full max-w-[150px]" />
        <span className="w-full truncate text-center text-[11px] font-medium text-[#0A0A0A]">{item.alt}</span>
      </div>
    );
  }
  return <img src={item.src} alt={item.alt} loading={eager ? "eager" : "lazy"} className={`h-full w-full object-cover ${zoom}`} />;
}

// ── Viewer ───────────────────────────────────────────────────────

/**
 * Full-screen viewer that works like a multi-image Instagram post: swipe
 * (or scroll, arrow keys, the arrow buttons) through every item, with a
 * counter and dots showing where you are. Opens on the tapped item. Clips
 * and audio notes play with controls; QR codes show large with a link.
 */
export function MediaViewer({
  items,
  palette,
  index,
  onIndex,
  onClose,
  contained = false,
}: {
  items: GalleryItem[];
  palette: [string, string];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Fill the parent instead of the viewport (Gallery tab preview). */
  contained?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const last = items.length - 1;

  const scrollTo = useCallback((i: number, behavior: ScrollBehavior = "smooth") => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior });
  }, []);
  const go = useCallback((d: number) => scrollTo(Math.max(0, Math.min(last, index + d))), [index, last, scrollTo]);

  // Start on the item that was tapped.
  useEffect(() => {
    scrollTo(index, "instant");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the item in view keeps playing.
  useEffect(() => {
    track.current?.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
      if (Number(m.dataset.slide) !== index) m.pause();
    });
  }, [index]);

  // The slide in view is the current item.
  function onScroll() {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index && i >= 0 && i <= last) onIndex(i);
  }

  useEffect(() => {
    if (contained) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    // Keep the item in view if the window is resized or the phone rotates.
    const onResize = () => scrollTo(index, "instant");
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = prevOverflow;
    };
  }, [contained, go, index, onClose, scrollTo]);

  // Arrow buttons are for desktop; the phone preview shows what a phone shows (swipe only).
  const navBtn = `absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full glass text-text-primary hover:bg-surface-elevated ${
    contained ? "" : "sm:flex"
  }`;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div role="dialog" aria-modal aria-label={items[index]?.alt} className={`pop ${contained ? "absolute" : "fixed"} inset-0 z-50 bg-black`}>
      <div
        ref={track}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => {
          const kind = galleryKind(item);
          const near = Math.abs(i - index) <= 1;
          return (
            <div key={item.key ?? item.src} onClick={onClose} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center">
              {kind === "video" ? (
                <video
                  src={item.src}
                  data-slide={i}
                  controls
                  playsInline
                  preload={near ? "metadata" : "none"}
                  onClick={stop}
                  className="max-h-full max-w-full"
                />
              ) : kind === "audio" ? (
                <div onClick={stop} className="w-[85%] max-w-[340px] rounded-3xl border border-border-default bg-surface-raised p-6 text-center">
                  <span
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white"
                    style={{ background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}
                  >
                    <WaveIcon className="h-8 w-8" />
                  </span>
                  <p className="mt-4 text-[17px] font-semibold leading-snug text-text-primary">{item.alt}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                    Audio note{item.duration ? ` · ${formatDuration(item.duration)}` : ""}
                  </p>
                  <audio src={item.src} data-slide={i} controls preload={near ? "metadata" : "none"} className="mt-5 w-full" />
                </div>
              ) : kind === "qr" ? (
                <div onClick={stop} className="flex w-[80%] max-w-[320px] flex-col items-center">
                  <div className="w-full rounded-3xl bg-white p-5">
                    <QrCode url={item.url ?? ""} className="aspect-square w-full" />
                    <p className="mt-3 truncate text-center text-[15px] font-semibold text-[#0A0A0A]">{item.alt}</p>
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-semibold text-surface hover:no-underline hover:brightness-110"
                    >
                      Open link ↗
                    </a>
                  )}
                  {item.url && <p className="mt-2 max-w-full truncate font-mono text-[11px] text-white/50">{item.url.replace(/^https?:\/\//, "")}</p>}
                </div>
              ) : (
                <img
                  src={item.src}
                  alt={item.alt}
                  loading={near ? "eager" : "lazy"}
                  draggable={false}
                  onClick={stop}
                  className="max-h-full max-w-full select-none object-contain"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-4">
        <span className="rounded-full bg-black/50 px-2.5 py-1 font-mono text-xs text-white/85 backdrop-blur-md">
          {index + 1} / {items.length}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full glass text-text-primary"
        >
          ✕
        </button>
      </div>

      {items.length > 1 && <Dots count={items.length} index={index} />}

      {index > 0 && (
        <button aria-label="Previous" className={`${navBtn} left-4`} onClick={() => go(-1)}>
          ←
        </button>
      )}
      {index < last && (
        <button aria-label="Next" className={`${navBtn} right-4`} onClick={() => go(1)}>
          →
        </button>
      )}
    </div>
  );
}

/** Position dots; long sets show a sliding window of dots, shrinking toward the edges. */
function Dots({ count, index }: { count: number; index: number }) {
  const WINDOW = 7;
  const start = Math.max(0, Math.min(count - WINDOW, index - Math.floor(WINDOW / 2)));
  const shown = Array.from({ length: Math.min(count, WINDOW) }, (_, k) => start + k);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-6 flex items-center justify-center gap-1.5">
      {shown.map((i) => {
        const edge = count > WINDOW && ((i === start && start > 0) || (i === start + WINDOW - 1 && i < count - 1));
        return (
          <span
            key={i}
            className={`rounded-full transition-all duration-200 ${i === index ? "bg-white" : "bg-white/40"} ${edge ? "h-1 w-1" : "h-1.5 w-1.5"}`}
          />
        );
      })}
    </div>
  );
}

function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

function WaveIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
