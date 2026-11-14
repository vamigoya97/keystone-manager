"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { galleryKind, type GalleryItem, type PublicKeystone } from "@/lib/keystones";
import { formatDuration } from "@/lib/gallery";
import { resolveTheme } from "@/lib/theme";
import { animate, motion, useMotionValue, useTransform, useReducedMotion as useMotionReducedMotion } from "motion/react";
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

// ── Claim motion set ─────────────────────────────────────────────

/** Whether the visitor asked for less motion (the motion set then stays still). */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

function MotionArtwork({
  keystone,
  developed,
  checking,
  pressKey,
}: {
  keystone: PlateKeystone;
  developed: boolean;
  checking: boolean;
  pressKey: number;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      key={pressKey}
      className={`relative overflow-hidden ${pressKey > 0 && !reduced ? "plate-press" : ""}`}
    >
      <TokenCard keystone={keystone} />
      {!developed && !reduced && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-overlay"
          style={{ opacity: checking ? 0.55 : 0.35 }}
        >
          <div className="plate-grain" />
        </div>
      )}
    </div>
  );
}

// ── Claim ────────────────────────────────────────────────────────

const gemstoneParticles = [
  { rough: [14, 13], cut: [18, 13] },
  { rough: [28, 9], cut: [30, 13] },
  { rough: [44, 15], cut: [42, 13] },
  { rough: [49, 29], cut: [50, 25] },
  { rough: [45, 40], cut: [40, 38] },
  { rough: [34, 48], cut: [30, 50] },
  { rough: [19, 46], cut: [20, 38] },
  { rough: [9, 31], cut: [10, 25] },
  { rough: [19, 25], cut: [22, 25] },
  { rough: [35, 22], cut: [38, 25] },
  { rough: [27, 37], cut: [30, 36] },
];

const roughOutline = "M 14 13 L 28 9 L 44 15 L 49 29 L 45 40 L 34 48 L 19 46 L 9 31 Z";
const cutOutline = "M 18 13 L 30 13 L 42 13 L 50 25 L 40 38 L 30 50 L 20 38 L 10 25 Z";

function AlignmentDiamond({ aligned, busy, reduceMotion }: {
  aligned: boolean;
  busy: boolean;
  reduceMotion: boolean;
}) {
  const progress = useMotionValue(aligned ? 1 : 0);
  const outline = useTransform(progress, [0, 1], [roughOutline, cutOutline]);
  const fillOpacity = useTransform(progress, [0, 1], [0.06, 0.1]);
  const cutFacets = useTransform(progress, [0.65, 1], [0, 1]);
  const roughFacets = useTransform(progress, [0, 0.55], [0.45, 0]);
  const duration = reduceMotion ? 0 : 0.8;
  const transition = { duration, ease: "easeInOut" } as const;

  useEffect(() => {
    if (reduceMotion) {
      progress.jump(aligned ? 1 : 0);
      return;
    }
    const animation = animate(progress, aligned ? 1 : 0, { duration, ease: "easeInOut" });
    return () => animation.stop();
  }, [aligned, duration, progress, reduceMotion]);

  return (
    <motion.svg
      aria-hidden="true"
      viewBox="0 0 60 60"
      className="size-12 overflow-visible"
      fill="none"
      initial={false}
      animate={reduceMotion ? { y: 0 } : { y: [0, busy ? -3 : -1.5, 0] }}
      transition={{ duration: reduceMotion ? 0 : busy ? 1.6 : 2.8, ease: "easeInOut", repeat: reduceMotion ? 0 : Infinity }}
    >
      <motion.path
        style={{ d: outline, fillOpacity }}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <motion.g style={{ opacity: cutFacets }}>
        <path d="M 18 13 L 22 25 L 10 25 M 42 13 L 38 25 H 50 M 30 13 L 22 25 H 38 Z"
          fill="currentColor" fillOpacity="0.12" />
        <path d="M 38 25 H 50 L 30 50 Z" fill="currentColor" fillOpacity="0.22" />
        <path d="M 10 25 H 50 M 18 13 L 22 25 L 30 50 L 38 25 L 42 13 M 22 25 L 30 13 L 38 25"
          stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
      </motion.g>
      <motion.path
        style={{ opacity: roughFacets }}
        d="M 14 13 L 19 25 L 9 31 M 19 25 L 35 22 L 44 15 M 19 25 L 27 37 L 34 48 M 27 37 L 35 22 L 45 40"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {gemstoneParticles.map(({ rough, cut }, index) => {
        const [x, y] = aligned ? cut : rough;
        return (
          <motion.circle
            key={index}
            initial={false}
            animate={{ cx: x, cy: y }}
            transition={{ ...transition, duration: reduceMotion ? 0 : 0.68, delay: reduceMotion ? 0 : index * 0.012 }}
            r={index % 3 === 0 ? 1.55 : 1}
            fill="currentColor"
            opacity={aligned ? 0.8 : 0.55}
          />
        );
      })}
      {!reduceMotion && (
        <motion.g
          className="origin-center motion-reduce:hidden"
          animate={{ rotate: 360 }}
          transition={{ duration: busy ? 2.6 : 5.5, ease: "linear", repeat: Infinity }}
        >
          <circle cx="5" cy="29" r="1.3" fill="currentColor" opacity="0.65" />
          <circle cx="48" cy="10" r="0.9" fill="currentColor" opacity="0.5" />
          <circle cx="45" cy="51" r="1.1" fill="currentColor" opacity="0.75" />
        </motion.g>
      )}
    </motion.svg>
  );
}

export function PlateClaim({
  keystone,
  status,
  access,
  phase,
  error,
  securing = false,
  signedIn = false,
  onClaim,
  onEnter,
  contained = false,
  motion: motionSet = false,
}: {
  keystone: PlateKeystone;
  status: AccessStatus;
  access: ClaimAccess;
  phase: MintPhase;
  error?: string | null;
  /** Sign-in is open after tapping the diamond; shown as part of securing. */
  securing?: boolean;
  /** Privy reported a successful sign-in: securing moves straight on to forging and the vault. */
  signedIn?: boolean;
  onClaim?: () => void;
  onEnter?: () => void;
  contained?: boolean;
  /**
   * The motion set (design lab): film grain before alignment and an artwork
   * press and ripple when the diamond is tapped.
   */
  motion?: boolean;
}) {
  const [press, setPress] = useState(0);
  const t = resolveTheme(keystone).claim;
  // Once Privy reports success the screen moves on at once: no lingering "Signing in…" while access is checked.
  const vaulting = phase === "minting" || phase === "minted" || (securing && signedIn);
  const loggingIn = securing && !vaulting;
  const forging = loggingIn || phase === "minting";
  const forged = phase === "minted";
  const holder = status === "holder" && !forging && !forged;
  const ready = !holder && !forging && !forged && status !== "revoked" && status !== "loading" && access === "chip";

  let statusText: string | undefined;
  if (access === "verifying") statusText = t.verifying;
  else if (loggingIn) statusText = t.login;
  else if (vaulting) statusText = t.vault;
  else if (status === "revoked") statusText = "Your access to this keystone was revoked.";
  else if (access === "failed") statusText = `${t.failedCustom || error || t.failed} Hold your phone to the item again.`;
  else if (phase === "error") statusText = `${error ?? "Forging didn't finish."} Tap the diamond to retry.`;
  else if (ready) statusText = "Aligned. Tap the diamond to secure this keystone and open the vault.";
  else if (status === "holder") statusText = "You hold this keystone.";
  else if (access === null) statusText = "Hold your phone to the item to secure this keystone.";

  const reducedMotion = useReducedMotion();
  const aligning = access === "verifying" || (access === "chip" && status === "loading" && !vaulting);
  const action = aligning ? undefined : holder ? onEnter : ready ? onClaim : undefined;
  const aligned = !aligning && (holder || (access === "chip" && status !== "revoked"));
  const busy = aligning || loggingIn || vaulting;
  const label = holder ? t.enterButton : t.claimButton;
  const hasError = status === "revoked" || access === "failed" || phase === "error";
  const diamondText = busy ? statusText ?? t.verifying : action && !hasError ? label : statusText;

  function activateDiamond() {
    if (motionSet && !reducedMotion) setPress((n) => n + 1);
    action?.();
  }

  return (
    <div className={`flex ${height(contained)} flex-col ${page}`} style={PLATE}>
      {/* The media alone carries the claim; the name, description and attributes wait in the vault. */}
      <Backdrop keystone={keystone} className="flex flex-1 flex-col">
        <h1 className="sr-only">{keystone.name}</h1>
        <div role="status" className="sr-only">{statusText}</div>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center">
          <motion.div
            initial={false}
            animate={{ opacity: aligning ? 0.65 : 1, y: aligning && !reducedMotion ? 5 : 0 }}
            transition={{ duration: aligned && !reducedMotion ? 0.22 : 0, ease: "easeOut" }}
          >
            {motionSet ? (
              <MotionArtwork
                keystone={keystone}
                developed={access === "chip" || status === "holder" || forging || forged}
                checking={access === "verifying"}
                pressKey={press}
              />
            ) : (
              <TokenCard keystone={keystone} />
            )}
          </motion.div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-xl items-center justify-end gap-3 pl-5 pr-[max(20px,env(safe-area-inset-right))] pb-[max(24px,calc(env(safe-area-inset-bottom)+16px))]">
          {press > 0 && motionSet && (
            <span key={press} aria-hidden className="plate-ripple motion-reduce:hidden" style={{ right: 16, bottom: 18, left: "auto" }} />
          )}
          {diamondText && (
            <span aria-hidden className="px-2.5 py-1.5 text-sm font-medium text-[var(--p-ink)]">
              {diamondText}
            </span>
          )}
          <button
            type="button"
            disabled={!action}
            aria-label={busy ? statusText ?? t.verifying : label}
            aria-busy={busy}
            onClick={activateDiamond}
            className="pointer-events-auto relative grid size-16 shrink-0 place-items-center rounded-full bg-transparent text-[var(--p-ink)] enabled:cursor-pointer enabled:active:opacity-80 focus-visible:outline-offset-2"
          >
            {aligned && access === "chip" && !reducedMotion && (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute size-10 rounded-full border border-current motion-reduce:hidden"
                initial={{ scale: 0.8, opacity: 0.65 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
              />
            )}
            <AlignmentDiamond aligned={aligned} busy={busy} reduceMotion={reducedMotion} />
          </button>
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
  animateGalleryEntrance = false,
}: {
  keystone: PlateKeystone;
  items: GalleryItem[];
  /** Access is still being confirmed: grey placeholders instead of items. */
  loading?: boolean;
  onOpen: (i: number) => void;
  onSignOut?: () => void;
  contained?: boolean;
  animateGalleryEntrance?: boolean;
}) {
  const banner = resolveTheme(keystone).gallery.banner;
  const logo = keystone.tokenImage;
  const reduceMotion = useMotionReducedMotion();
  const fadeGallery = animateGalleryEntrance && !reduceMotion;
  return (
    <div className={`flex ${height(contained)} flex-col ${page}`} style={PLATE}>
      {/* The operator's background runs behind the whole vault, so the hairline gaps between items show it. */}
      <Backdrop keystone={keystone} className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <h1 className="sr-only">{keystone.name}</h1>
        <motion.div
          initial={fadeGallery ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={fadeGallery ? { duration: 0.2, ease: "easeOut" } : { duration: 0 }}
        >
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
        </motion.div>
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
  const reduceMotion = useMotionReducedMotion();

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
            {keystones.map((k, index) => (
              <motion.div
                key={k.slug}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(index, 5) * 0.035, ease: "easeOut" }}
              >
                <Link
                  href={`/x/${k.slug}/gallery`}
                  title={k.name}
                  aria-label={k.name}
                  className="block aspect-square overflow-hidden focus-visible:outline-offset-[-2px]"
                  style={{ background: `linear-gradient(135deg, ${k.palette[0]}, ${k.palette[1]})` }}
                >
                  {k.tokenImage && <img src={k.tokenImage} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
