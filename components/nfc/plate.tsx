"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { galleryKind, type GalleryItem, type PublicKeystone } from "@/lib/keystones";
import { formatDuration } from "@/lib/gallery";
import { resolveTheme } from "@/lib/theme";
import Link from "next/link";
import type { AccessStatus } from "@/lib/useAccess";
import type { MemberKeystone } from "./member";
import TokenCard from "./TokenCard";
import QrCode from "./QrCode";
import { MediaView } from "./themed";

/**
 * Plate: the member screens (claim, vault, home). The uploaded media is the
 * page: the artwork centred on the operator's background, gallery items tiled
 * with hairline gaps, and everything else set quietly in neutral ink. No glow,
 * blur, confetti or entrance motion; each claim step is one icon and the slide
 * button. The Customize and Gallery tabs preview these same components.
 */

type PlateKeystone = Omit<PublicKeystone, "galleryCount">;

export type MintPhase = "idle" | "minting" | "minted" | "error";

/**
 * Where this visitor's claim session stands: a chip tap still being checked
 * or rejected, verified by a chip, or none at all.
 */
export type ClaimAccess = "verifying" | "failed" | "chip" | null;

/** Fill the parent (phone previews) or the screen. */
const height = (contained: boolean) => (contained ? "min-h-full" : "min-h-[100dvh]");

export const PLATE: CSSProperties = {
  ["--p-page" as string]: "#E5E5E2",
  ["--p-raised" as string]: "#F1F1EF",
  ["--p-ink" as string]: "#161616",
  ["--p-slate" as string]: "#66665F",
  ["--p-rule" as string]: "#CDCDC8",
  ["--p-alert" as string]: "#9A3A2C",
  ["--p-on-ink" as string]: "#F1F1EF",
};

const page = "bg-[var(--p-page)] text-[var(--p-ink)] [font-family:var(--font-plate),system-ui,sans-serif] antialiased";

/** Ink and rules for text set over a dark background color or media. */
const ON_DARK = {
  ["--p-ink" as string]: "#F2F2F0",
  ["--p-slate" as string]: "rgba(242,242,240,0.66)",
  ["--p-rule" as string]: "rgba(242,242,240,0.2)",
  ["--p-raised" as string]: "rgba(242,242,240,0.08)",
  ["--p-alert" as string]: "#F0A595",
  ["--p-on-ink" as string]: "#161616",
};

function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

/**
 * The operator's background (Customize → Background) for everything under the
 * media: a color, and optionally an image or looping video dimmed beneath the
 * text. Ink flips to light whenever the background is dark. The artwork and
 * gallery themselves are never covered.
 */
function Backdrop({ keystone, children, className = "" }: { keystone: PlateKeystone; children: ReactNode; className?: string }) {
  const style = resolveTheme(keystone).claim.style;
  const media = keystone.theme?.background?.media;
  const color = style.backgroundColor;
  const dark = !!media || (!!color && isDark(color));
  const vars: CSSProperties = {
    ...(color ? { ["--p-page" as string]: color } : {}),
    ...(dark ? ON_DARK : {}),
    ...(style.text.color ? { ["--p-ink" as string]: style.text.color } : {}),
  };
  return (
    <div className={`relative isolate bg-[var(--p-page)] text-[var(--p-ink)] ${className}`} style={vars}>
      {media && (
        <>
          <MediaView media={media} className="absolute inset-0 -z-10 h-full w-full object-cover" />
          {/* At least 45% dim keeps the description and attributes readable. */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-black" style={{ opacity: Math.max(style.dim, 45) / 100 }} />
        </>
      )}
      {children}
    </div>
  );
}

// ── Attributes ───────────────────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const day = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

/** The contract's attributes, in the order they're written on chain, as people read them. */
function attributes(k: PlateKeystone): [string, string][] {
  const rows: [string, string][] = [];
  if (k.location) rows.push(["Location", k.location]);
  if (k.startDate) rows.push(k.endDate && k.endDate !== k.startDate ? ["Dates", `${day(k.startDate)} to ${day(k.endDate)}`] : ["Date", day(k.startDate)]);
  for (const t of k.traits ?? []) rows.push([t.key, t.value]);
  return rows;
}

function Details({ keystone, heading }: { keystone: PlateKeystone; heading?: string }) {
  const rows = attributes(keystone);
  return (
    <div className="px-5">
      {heading && <h2 className="mb-3 text-[20px] font-semibold leading-tight tracking-[-0.01em]">{heading}</h2>}
      {keystone.description && <p className="max-w-[60ch] whitespace-pre-line text-[15px] leading-[1.6]">{keystone.description}</p>}
      {rows.length > 0 && (
        <dl className="mt-6 border-t border-[var(--p-rule)] text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-b border-[var(--p-rule)] py-3">
              <dt className="text-[var(--p-slate)]">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function InkButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-12 w-full rounded-md bg-[var(--p-ink)] text-[15px] font-medium text-[var(--p-on-ink)] focus-visible:outline-offset-2 active:opacity-85"
    >
      {children}
    </button>
  );
}

type SlideMode = "loading" | "ready" | "busy" | "done" | "off";

/**
 * The one action on the claim screen: slide the knob to the end. The track is
 * nearly transparent so the backdrop shows through; the knob follows the
 * finger and returns if released early. A click or Enter/Space on the knob
 * also completes it.
 *
 * - loading: greyed out, the knob spins while the item is being aligned
 * - ready:   slide to secure / forge / enter
 * - busy:    knob parked at the end, spinning while the keystone is forged
 * - done:    knob parked at the end with a check
 * - off:     greyed out, nothing to do yet
 */
function SlideButton({ mode, label, onComplete }: { mode: SlideMode; label: string; onComplete?: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; max: number } | null>(null);
  const moved = useRef(false);
  const xRef = useRef(0);
  const [x, setXState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const setX = (v: number) => {
    xRef.current = v;
    setXState(v);
  };
  const KNOB = 48;
  const PAD = 4;
  const max = () => (track.current?.clientWidth ?? 0) - KNOB - PAD * 2;
  const live = mode === "ready";
  const parked = mode === "busy" || mode === "done";

  // Parked modes sit at the end; everything else starts over at the left.
  useEffect(() => {
    setX(parked ? max() : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function complete() {
    setX(max());
    onComplete?.();
  }

  const progress = parked ? 1 : Math.min(1, x / Math.max(1, max()));
  const greyed = mode === "loading" || mode === "off";

  return (
    <div
      ref={track}
      aria-busy={mode === "loading" || mode === "busy"}
      className={`relative h-14 select-none rounded-full border border-[var(--p-rule)] bg-[color-mix(in_srgb,var(--p-ink)_5%,transparent)] touch-pan-y ${greyed ? "opacity-45" : ""}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 flex items-center text-[15px] font-medium text-[var(--p-ink)] ${parked ? "justify-start pl-6" : "justify-center pl-10"}`}
        style={{ opacity: parked ? 1 : 1 - progress }}
      >
        {label}
      </span>
      <button
        type="button"
        disabled={!live}
        aria-label={live ? `Slide to ${label.toLowerCase()}` : label}
        onPointerDown={(e) => {
          if (!live) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Pointer already gone; the drag still works while it stays over the knob.
          }
          start.current = { x: e.clientX - xRef.current, max: max() };
          moved.current = false;
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const nx = Math.max(0, Math.min(start.current.max, e.clientX - start.current.x));
          if (Math.abs(nx - xRef.current) > 2) moved.current = true;
          setX(nx);
        }}
        onPointerUp={() => {
          if (!start.current) return;
          const reached = xRef.current >= start.current.max * 0.9;
          start.current = null;
          setDragging(false);
          if (reached) complete();
          else setX(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setX(0);
        }}
        onClick={() => {
          // A plain click or keyboard press completes it too; a drag that fell short doesn't.
          if (live && !moved.current) complete();
        }}
        className={`absolute top-1 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--p-ink)] text-[var(--p-on-ink)] ${
          live ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        } ${dragging ? "" : "transition-[left] duration-200 ease-out"}`}
        style={{ left: PAD + x - 1 }}
      >
        {mode === "loading" || mode === "busy" ? (
          <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-[1.8px] border-current border-t-transparent" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {mode === "done" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M9 5l7 7-7 7" />}
          </svg>
        )}
      </button>
    </div>
  );
}

// ── Claim ────────────────────────────────────────────────────────

/** Sign-in and forging, shown as one step. */
const SECURING = "Securing your keystone…";

/**
 * The claim screen: the artwork centred on the operator's background, a
 * status icon in the top-left corner, and the slide button at the bottom.
 * Aligning greys the button out with a spinning knob. Once aligned, one slide
 * does the rest: sign-in (when signed out) and forging run as a single
 * "securing" step with the knob parked and spinning, and the vault opens as
 * soon as the keystone is forged. A failed forge is the only reason to slide
 * again.
 */
export function PlateClaim({
  keystone,
  status,
  access,
  phase,
  error,
  securing = false,
  onClaim,
  onEnter,
  contained = false,
}: {
  keystone: PlateKeystone;
  status: AccessStatus;
  access: ClaimAccess;
  phase: MintPhase;
  error?: string | null;
  /** Sign-in is open after the slide; shown as part of securing. */
  securing?: boolean;
  onClaim?: () => void;
  onEnter?: () => void;
  contained?: boolean;
}) {
  const t = resolveTheme(keystone).claim;
  const forging = phase === "minting" || securing;
  const forged = phase === "minted";
  const holder = status === "holder" && !forging && !forged;
  const ready = !holder && !forging && !forged && status !== "revoked" && status !== "loading" && access === "chip";

  // Each step is one icon in the corner; the words stay for screen readers and as a tooltip.
  let state: [StatusIcon, string, boolean] | null = null;
  if (access === "verifying") state = ["checking", t.verifying, false];
  else if (forging) state = ["forging", SECURING, false];
  else if (forged) state = ["forged", "Secured. Opening the vault…", false];
  else if (status === "revoked") state = ["revoked", "Your access to this keystone was revoked.", true];
  else if (access === "failed") state = ["alert", `${t.failedCustom || error || t.failed} Hold your phone to the item again.`, true];
  else if (phase === "error") state = ["alert", `${error ?? "Forging didn't finish."} Slide again to retry.`, true];
  else if (ready) state = ["aligned", "Aligned. Slide once to secure this keystone and open the vault.", false];
  else if (status === "holder") state = ["held", "You hold this keystone.", false];
  else if (access === null) state = ["tap-item", "Hold your phone to the item to secure this keystone.", false];

  let slide: { mode: SlideMode; label: string; onComplete?: () => void };
  if (access === "verifying") slide = { mode: "loading", label: t.verifying };
  else if (forging) slide = { mode: "busy", label: SECURING };
  else if (forged) slide = { mode: "done", label: "Secured" };
  else if (holder) slide = { mode: "ready", label: t.enterButton, onComplete: onEnter };
  // Signed in or not, it's the same single slide: sign-in, if needed, is part of securing.
  else if (ready) slide = { mode: "ready", label: t.claimButton, onComplete: onClaim };
  else slide = { mode: "off", label: status === "revoked" ? "Access revoked" : t.claimButton };

  return (
    <div className={`flex ${height(contained)} flex-col ${page}`} style={PLATE}>
      {/* The media alone carries the claim; the name, description and attributes wait in the vault. */}
      <Backdrop keystone={keystone} className="flex flex-1 flex-col">
        <h1 className="sr-only">{keystone.name}</h1>
        <div aria-live="polite" className="absolute left-5 top-[max(20px,calc(env(safe-area-inset-top)+12px))] z-10 flex h-6 items-center">
          {state && (
            <span role="status" title={state[1]} className={state[2] ? "text-[var(--p-alert)]" : "text-[var(--p-slate)]"}>
              <Status icon={state[0]} className="h-5 w-5" />
              <span className="sr-only">{state[1]}</span>
            </span>
          )}
        </div>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center">
          <TokenCard keystone={keystone} />
        </div>
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-xl px-5 pb-[max(32px,calc(env(safe-area-inset-bottom)+16px))]">
          <SlideButton key={`${slide.mode}-${slide.label}`} {...slide} />
        </div>
      </Backdrop>
    </div>
  );
}

// ── Vault ────────────────────────────────────────────────────────

/** Tile shape in the vault grid: photos and clips keep their own; audio notes and QR cards use fixed shapes. */
export function plateAspect(item: GalleryItem) {
  const kind = galleryKind(item);
  if (kind === "audio") return item.wide ? "8 / 3" : "4 / 3";
  if (kind === "qr") return "1 / 1";
  return `${item.width} / ${item.height}`;
}

/** Width over height of an item's tile. */
export function plateRatio(item: GalleryItem) {
  const [w, h] = plateAspect(item).split("/").map(Number);
  return w / h || 1;
}

/**
 * Flex sizing for items side by side at one shared height: each grows in
 * proportion to its width-to-height ratio, so none is cropped or padded.
 */
export const rowFlex = (item: GalleryItem) => ({ flex: `${plateRatio(item)} 1 0%`, aspectRatio: plateAspect(item) });

/** A vault row: one full-width item, or one to three items side by side at a shared height. */
export type VaultRow = { wide: true; index: number } | { wide: false; indices: number[] };

/**
 * The vault's rows, read left to right and top to bottom in gallery order.
 * Full-width items get a row each; other items sit one to three to a row at
 * a shared height.
 *
 * Once an operator has arranged the vault (any item has `sameRow` set), rows
 * follow exactly what they set, and items added since pair up after them. A
 * single item left alone (say, after a deletion) joins the row beside it when
 * there's room.
 *
 * Never arranged: items pair up automatically and no item is left alone. A
 * single item before a full-width one waits for the next item so the two sit
 * side by side (the full-width item moves down one place), and a single item
 * at the very end joins the row above.
 */
export function vaultRows(items: GalleryItem[]): VaultRow[] {
  return items.some((g) => g.sameRow !== undefined) ? arrangedRows(items) : autoRows(items);
}

/** Rows as the operator arranged them. */
function arrangedRows(items: GalleryItem[]): VaultRow[] {
  const rows: { wide: boolean; indices: number[] }[] = [];
  items.forEach((item, i) => {
    const last = rows[rows.length - 1];
    if (item.wide) rows.push({ wide: true, indices: [i] });
    else if (last && !last.wide && last.indices.length < 3 && (item.sameRow ?? (last.indices.length === 1 && items[last.indices[0]].sameRow === undefined))) {
      last.indices.push(i);
    } else rows.push({ wide: false, indices: [i] });
  });
  // A lone half-width item joins the row before it, or else the row after it, when either has room.
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.wide || row.indices.length !== 1) continue;
    const prev = rows[r - 1];
    const next = rows[r + 1];
    if (prev && !prev.wide && prev.indices.length < 3) {
      prev.indices.push(...row.indices);
      rows.splice(r--, 1);
    } else if (next && !next.wide && next.indices.length < 3) {
      next.indices.unshift(...row.indices);
      rows.splice(r--, 1);
    }
  }
  return rows.map((r) => (r.wide ? { wide: true, index: r.indices[0] } : { wide: false, indices: r.indices }));
}

/** Rows for a vault that's never been arranged: pairs, nothing left alone. */
function autoRows(items: GalleryItem[]): VaultRow[] {
  // First, runs of half-width items between full-width ones.
  const runs: VaultRow[] = [];
  let run: number[] = [];
  let held: number[] = [];
  const flush = () => {
    if (run.length) runs.push({ wide: false, indices: run });
    for (const i of held) runs.push({ wide: true, index: i });
    run = [];
    held = [];
  };
  items.forEach((item, i) => {
    if (item.wide) {
      // A lone item would sit by itself: hold full-width items until it has a partner.
      if (run.length === 1) held.push(i);
      else {
        flush();
        runs.push({ wide: true, index: i });
      }
    } else {
      run.push(i);
      if (held.length && run.length >= 2) flush();
    }
  });
  if (run.length === 1) {
    const lastHalf = [...runs].reverse().find((r): r is { wide: false; indices: number[] } => !r.wide);
    if (lastHalf) {
      lastHalf.indices.push(run[0]);
      run = [];
    }
  }
  flush();

  // Then each run in rows of two, three in the last row when the count is odd.
  const rows: VaultRow[] = [];
  for (const r of runs) {
    if (r.wide) {
      rows.push(r);
      continue;
    }
    const ix = r.indices;
    for (let k = 0; k < ix.length; ) {
      const take = ix.length - k === 3 ? 3 : Math.min(2, ix.length - k);
      rows.push({ wide: false, indices: ix.slice(k, k + take) });
      k += take;
    }
  }
  return rows;
}

/** One gallery item as a tile. QR codes show their card's front (the vault makes it flip). */
export function PlateTile({ item, logo }: { item: GalleryItem; logo?: string }) {
  const kind = galleryKind(item);
  if (kind === "video") {
    return (
      <>
        <video src={`${item.src}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        <span className="absolute bottom-2 left-2 text-[11px] font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {formatDuration(item.duration) || "Clip"}
        </span>
      </>
    );
  }
  if (kind === "audio") {
    if (item.wide) {
      return (
        <div className="flex h-full w-full items-center gap-4 bg-[var(--p-raised)] px-5 text-left">
          <Wave className="h-7 w-7 shrink-0 text-[var(--p-slate)]" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[15px] font-medium leading-snug">{item.alt}</span>
            <span className="mt-0.5 block text-[12px] tabular-nums text-[var(--p-slate)]">{formatDuration(item.duration) || "Audio"}</span>
          </span>
          <Play className="h-5 w-5 shrink-0" />
        </div>
      );
    }
    return (
      <div className="flex h-full w-full flex-col justify-end gap-1 bg-[var(--p-raised)] p-3 text-left">
        <Wave className="mb-auto h-5 w-5 text-[var(--p-slate)]" />
        <span className="line-clamp-2 text-[13px] font-medium leading-snug">{item.alt}</span>
        <span className="text-[12px] tabular-nums text-[var(--p-slate)]">{formatDuration(item.duration) || "Audio"}</span>
      </div>
    );
  }
  if (kind === "qr") return <QrFront item={item} />;
  return <img src={item.src} alt={item.alt} loading="lazy" className="h-full w-full object-cover" />;
}

/** A QR card's front: its label and text, with a small code mark showing there's a code behind. */
function QrFront({ item, large = false }: { item: GalleryItem; large?: boolean }) {
  return (
    <div className={`flex h-full w-full flex-col bg-[var(--p-raised)] text-left ${large ? "p-7" : "p-4"}`}>
      <span className={`font-semibold leading-snug tracking-[-0.01em] ${large ? "text-[22px]" : "line-clamp-2 text-[15px]"}`}>{item.alt}</span>
      {item.text && (
        <span className={`mt-2 whitespace-pre-line leading-[1.5] text-[var(--p-slate)] ${large ? "text-[15px]" : "line-clamp-4 text-[12px]"}`}>{item.text}</span>
      )}
      <QrMark className={`mt-auto shrink-0 text-[var(--p-slate)] ${large ? "h-6 w-6" : "h-4 w-4"}`} />
    </div>
  );
}

/** A QR card's back: the code (with the keystone artwork in the centre) and, in the viewer, Open link. */
function QrBack({ item, logo, large = false }: { item: GalleryItem; logo?: string; large?: boolean }) {
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center bg-white ${large ? "gap-5 p-8" : "p-3"}`}>
      <QrCode url={item.url ?? ""} logo={logo} className={`aspect-square ${large ? "w-full max-w-[320px]" : "w-full"}`} />
      {large && item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[14px] font-medium text-[#161616] underline underline-offset-4"
        >
          Open link
        </a>
      )}
    </div>
  );
}

/**
 * A QR code as a two-sided card: the front carries the operator's text;
 * tapping (or Enter/Space) turns it over to the code, and again to turn it
 * back. The turn is the one motion here, and only on request.
 */
function QrCard({ item, logo, large = false, className = "" }: { item: GalleryItem; logo?: string; large?: boolean; className?: string }) {
  const [flipped, setFlipped] = useState(false);
  const flip = () => setFlipped((f) => !f);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? `${item.alt}: QR code shown, tap to show the text` : `${item.alt}: tap to show the QR code`}
      onClick={flip}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          flip();
        }
      }}
      className={`relative cursor-pointer [perspective:1200px] focus-visible:outline-offset-[-2px] ${className}`}
    >
      <div
        className={`relative h-full w-full transition-transform duration-500 ease-out [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]" aria-hidden={flipped}>
          <QrFront item={item} large={large} />
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" aria-hidden={!flipped}>
          <QrBack item={item} logo={logo} large={large} />
        </div>
      </div>
    </div>
  );
}

const SKELETON = [5 / 4, 3 / 4, 1, 4 / 5, 4 / 3, 1, 3 / 4, 5 / 4];

/**
 * The vault: the operator's banner, then every item edge to edge in two
 * columns, then the keystone's description and attributes on the operator's
 * background. Sign out sits at the very end.
 */
export function PlateVault({
  keystone,
  items,
  loading = false,
  onOpen,
  onSignOut,
  contained = false,
}: {
  keystone: PlateKeystone;
  items: GalleryItem[];
  /** Access is still being confirmed: grey placeholders instead of items. */
  loading?: boolean;
  onOpen: (i: number) => void;
  onSignOut?: () => void;
  contained?: boolean;
}) {
  const banner = resolveTheme(keystone).gallery.banner;
  const logo = keystone.tokenImage;
  return (
    <div className={`flex ${height(contained)} flex-col ${page}`} style={PLATE}>
      {/* The operator's background runs behind the whole vault, so the hairline gaps between items show it. */}
      <Backdrop keystone={keystone} className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <h1 className="sr-only">{keystone.name}</h1>
        {banner?.src && (
          <div className="mb-[2px] aspect-[3/1] overflow-hidden">
            <MediaView media={banner} className="h-full w-full object-cover" />
          </div>
        )}
        {loading ? (
          <div className="columns-2 gap-[2px]" aria-busy>
            {SKELETON.map((r, i) => (
              <div key={i} className="mb-[2px] bg-[var(--p-raised)]" style={{ aspectRatio: r }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-5 pt-10 text-[15px] text-[var(--p-slate)]">Nothing in the vault yet.</p>
        ) : (
          <div className="flex flex-col gap-[2px]">
            {vaultRows(items).map((row) =>
              row.wide ? (
                <VaultItem key={keyOf(items[row.index])} item={items[row.index]} logo={logo} onOpen={() => onOpen(row.index)} />
              ) : (
                // Side by side at one shared height; a lone item keeps half the width.
                <div key={keyOf(items[row.indices[0]])} className={`flex gap-[2px] ${row.indices.length === 1 ? "w-1/2" : ""}`}>
                  {row.indices.map((i) => (
                    <VaultItem key={keyOf(items[i])} item={items[i]} logo={logo} onOpen={() => onOpen(i)} style={rowFlex(items[i])} />
                  ))}
                </div>
              ),
            )}
          </div>
        )}
        <div className="flex-1 pb-[max(40px,calc(env(safe-area-inset-bottom)+24px))] pt-10">
          <Details keystone={keystone} heading="About this keystone" />
          {onSignOut && (
            <div className="px-5 pt-10">
              <button onClick={onSignOut} className="text-[13px] text-[var(--p-slate)] underline-offset-4 hover:underline">
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      </Backdrop>
    </div>
  );
}

const keyOf = (g: GalleryItem) => g.key ?? g.src;

/** One vault tile: QR cards flip in place; everything else opens the viewer. */
function VaultItem({
  item,
  logo,
  onOpen,
  className = "",
  style: sizing,
}: {
  item: GalleryItem;
  logo?: string;
  onOpen: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const style = sizing ?? { aspectRatio: plateAspect(item) };
  if (galleryKind(item) === "qr") {
    return (
      <div className={`${sizing ? "min-w-0" : "w-full"} overflow-hidden ${className}`} style={style}>
        <QrCard item={item} logo={logo} className="h-full w-full" />
      </div>
    );
  }
  return (
    <button
      onClick={onOpen}
      aria-label={`Open ${item.alt}`}
      className={`relative block ${sizing ? "min-w-0" : "w-full"} overflow-hidden focus-visible:outline-offset-[-2px] ${className}`}
      style={style}
    >
      <PlateTile item={item} />
    </button>
  );
}

/** Full-bleed viewer on black: swipe between items, caption and position underneath. */
export function PlateViewer({
  items,
  index,
  onIndex,
  onClose,
  logo,
  contained = false,
}: {
  items: GalleryItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** The keystone artwork, shown in the centre of QR codes. */
  logo?: string;
  /** Fill the parent (phone previews) instead of the screen. */
  contained?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const scrollTo = (i: number, behavior: ScrollBehavior) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior });
  };

  // Open on the tapped item.
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

  // Full screen: Escape closes, arrows step, the page behind doesn't scroll.
  useEffect(() => {
    if (contained) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") scrollTo(Math.min(items.length - 1, index + 1), "smooth");
      if (e.key === "ArrowLeft") scrollTo(Math.max(0, index - 1), "smooth");
    };
    const onResize = () => scrollTo(index, "instant");
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = prev;
    };
  }, [contained, index, items.length, onClose]);

  const item = items[index];

  return (
    <div
      className={`${contained ? "absolute" : "fixed"} inset-0 z-50 flex flex-col bg-black text-white [font-family:var(--font-plate),system-ui,sans-serif]`}
      role="dialog"
      aria-modal
      aria-label="Viewer"
    >
      <div className="flex justify-end px-5 pb-4 pt-[max(16px,env(safe-area-inset-top))]">
        <button onClick={onClose} className="text-[13px] text-white/70 hover:text-white">
          Close
        </button>
      </div>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== index) onIndex(i);
        }}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      >
        {items.map((it, i) => (
          <div key={it.key ?? it.src} className="flex w-full shrink-0 snap-center items-center justify-center">
            <Slide item={it} index={i} active={i === index} logo={logo} />
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-4 px-5 pb-[max(32px,calc(env(safe-area-inset-bottom)+16px))] pt-4 text-[13px]">
        <span className="truncate">{item?.alt}</span>
        <span className="shrink-0 tabular-nums text-white/55">
          {index + 1} of {items.length}
        </span>
      </div>
    </div>
  );
}

function Slide({ item, index, active, logo }: { item: GalleryItem; index: number; active: boolean; logo?: string }) {
  const kind = galleryKind(item);
  if (kind === "video") {
    return <video data-slide={index} src={item.src} controls playsInline preload={active ? "auto" : "metadata"} className="max-h-full w-full" />;
  }
  if (kind === "audio") {
    return (
      <div className="w-full px-5">
        <Wave className="mb-6 h-10 w-10 text-white/60" />
        <p className="mb-4 text-[20px] font-semibold">{item.alt}</p>
        <audio data-slide={index} src={item.src} controls className="w-full" />
      </div>
    );
  }
  if (kind === "qr") {
    return (
      <div className="w-full px-8" style={PLATE}>
        <QrCard item={item} logo={logo} large className="mx-auto aspect-square w-full max-w-[420px] text-[var(--p-ink)]" />
      </div>
    );
  }
  return <img src={item.src} alt={item.alt} draggable={false} className="max-h-full w-full object-contain" />;
}

type StatusIcon = "checking" | "aligned" | "forging" | "forged" | "held" | "alert" | "revoked" | "tap-item";

/** Static line icons for the claim steps (no motion), drawn on a 24px grid. */
function Status({ icon, className = "" }: { icon: StatusIcon; className?: string }) {
  const paths: Record<StatusIcon, ReactNode> = {
    // Waves reading the chip.
    checking: (
      <>
        <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    // Target locked: the item is aligned.
    aligned: (
      <>
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="9.5" />
      </>
    ),
    // Hourglass: forging is under way.
    forging: <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 4.5-8 8.5s8 4 8 8.5" />,
    forged: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    // Seal with a check: already held.
    held: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.3l2.8 2.8L16.2 9.6" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3.8l9 15.7H3z" strokeLinejoin="round" />
        <path d="M12 10v4.2" />
        <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
    revoked: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M5.6 18.4L18.4 5.6" />
      </>
    ),
    // Phone held to the item.
    "tap-item": (
      <>
        <rect x="7" y="2.8" width="10" height="18.4" rx="2" />
        <path d="M10.5 18h3" />
        <path d="M3.5 9a5 5 0 0 1 0 6M20.5 9a5 5 0 0 0 0 6" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      {paths[icon]}
    </svg>
  );
}

function Play({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

/** A tiny QR glyph: three corner squares and a dot. */
function QrMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1.5" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1.5" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1.5" />
      <rect x="15" y="15" width="2.5" height="2.5" rx="0.6" fill="currentColor" stroke="none" />
      <rect x="18.5" y="18.5" width="2" height="2" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Wave({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ── Member home ──────────────────────────────────────────────────

/**
 * The member home: claimed keystones as square artwork, two per row, edge to
 * edge. Each opens its vault. Signed out, one sentence and Sign in.
 */
export function PlateHome({
  state,
  keystones,
  error,
  onSignIn,
  onSignOut,
  contained = false,
}: {
  state: "loading" | "signed-out" | "ready";
  keystones: MemberKeystone[];
  error?: string | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  contained?: boolean;
}) {
  return (
    <div className={`flex ${height(contained)} flex-col ${page}`} style={PLATE}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <header className="flex items-baseline justify-between px-5 pb-4 pt-[max(20px,calc(env(safe-area-inset-top)+12px))]">
          <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Your keystones</h1>
          {state === "ready" && onSignOut && (
            <button onClick={onSignOut} className="text-[13px] text-[var(--p-slate)] underline-offset-4 hover:underline">
              Sign out
            </button>
          )}
        </header>
        {state === "signed-out" ? (
          <div className="mt-auto px-5 pb-[max(40px,calc(env(safe-area-inset-bottom)+24px))]">
            <p className="mb-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em]">Hold your phone to your item.</p>
            <p className="mb-8 max-w-[34ch] text-[15px] leading-[1.6] text-[var(--p-slate)]">
              That secures its keystone. If you already hold one, sign in to see it.
            </p>
            <InkButton onClick={onSignIn}>Sign in</InkButton>
          </div>
        ) : error ? (
          <p className="px-5 pt-16 text-[15px] leading-[1.6] text-[var(--p-alert)]">{error}</p>
        ) : state === "loading" ? (
          <div className="grid grid-cols-2 gap-[2px]" aria-busy>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="aspect-square bg-[var(--p-raised)]" />
            ))}
          </div>
        ) : keystones.length === 0 ? (
          <p className="px-5 pt-16 text-[15px] leading-[1.6] text-[var(--p-slate)]">
            Nothing here yet. Hold your phone to an item to secure its keystone.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-[2px]">
            {keystones.map((k) => (
              <Link
                key={k.slug}
                href={`/x/${k.slug}/gallery`}
                title={k.name}
                aria-label={k.name}
                className="block aspect-square overflow-hidden focus-visible:outline-offset-[-2px]"
                style={{ background: `linear-gradient(135deg, ${k.palette[0]}, ${k.palette[1]})` }}
              >
                {k.tokenImage && <img src={k.tokenImage} alt="" loading="lazy" className="h-full w-full object-cover" />}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
