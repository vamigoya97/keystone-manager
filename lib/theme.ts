import type { ArtworkPosition, ClaimStyle, Keystone, KeystoneTheme, ThemeMedia } from "./keystones";

/**
 * Resolving and validating operator customization. Client-safe: the
 * Customize tab and the member pages share these.
 *
 * Operators customize with media (image, GIF or short video on public IPFS)
 * and the claim screen's styling within CLAIM_LIMITS. Anything else uses the
 * standard copy, animations and layout below.
 */

export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 15;
export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "video/mp4", "video/webm"];

/** Ranges for the claim screen's styling (Customize tab sliders; the server clamps to these). */
export const CLAIM_LIMITS = {
  size: { min: 50, max: 100 },
  radius: { min: 0, max: 48 },
  borderWidth: { min: 0, max: 8 },
  textSize: { min: 12, max: 20 },
  dim: { min: 0, max: 80 },
  alertChars: 80,
};

const DEFAULT_COPY = {
  aligning: "Aligning keystone…",
  failed: "This keystone couldn't be aligned.",
};

/** The claim screen's styling with defaults filled in. */
export function claimStyle(c: ClaimStyle = {}) {
  const a = c.artwork ?? {};
  return {
    backgroundColor: c.backgroundColor,
    dim: c.dim ?? 0,
    artwork: {
      size: a.size ?? 100,
      position: a.position ?? ("center" as ArtworkPosition),
      radius: a.radius ?? 0,
      borderWidth: a.borderWidth ?? 0,
      borderColor: a.borderColor ?? "#FFFFFF",
      shadow: a.shadow ?? true,
    },
    text: { size: c.text?.size ?? 14, color: c.text?.color, align: c.text?.align ?? "center" },
    alerts: { color: c.alerts?.color, background: c.alerts?.background },
  };
}

type Named = Pick<Keystone, "name" | "description" | "theme">;

/** The operator's media and styling plus the standard wording for the member screens. */
export function resolveTheme(exp: Named) {
  const t: KeystoneTheme = exp.theme ?? {};
  const alerts = t.claim?.alerts ?? {};
  return {
    background: { media: t.background?.media, dim: 55 },
    claim: {
      style: claimStyle(t.claim),
      verifying: alerts.aligning || DEFAULT_COPY.aligning,
      failed: DEFAULT_COPY.failed,
      /** The operator's own "not aligned" message, shown instead of the server's reason. */
      failedCustom: alerts.failed,
      /** The slide button's label once aligned; one slide signs in (if needed) and forges. */
      claimButton: "Secure keystone",
      enterButton: "Enter the vault",
    },
    gallery: {
      banner: t.gallery?.banner,
    },
  };
}


// ── Validation (server applies this to anything an operator saves) ───────

/** Only https URLs or ipfs:// are accepted for media. */
function media(v: unknown): ThemeMedia | undefined {
  if (!v || typeof v !== "object") return undefined;
  const m = v as Record<string, unknown>;
  const src = typeof m.src === "string" ? m.src : "";
  if (!/^(https:\/\/|ipfs:\/\/)[^\s"'<>]+$/.test(src) || src.length > 500) return undefined;
  const kind = m.kind === "video" ? "video" : m.kind === "image" ? "image" : undefined;
  if (!kind) return undefined;
  return { src, kind, cid: typeof m.cid === "string" ? m.cid.slice(0, 100) : undefined };
}

const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : undefined);
const num = (v: unknown, { min, max }: { min: number; max: number }) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined;
const oneOf = <T extends string>(v: unknown, options: readonly T[]) => (options.includes(v as T) ? (v as T) : undefined);
// Short plain text: trimmed, single line, no control characters.
// eslint-disable-next-line no-control-regex
const copy = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, CLAIM_LIMITS.alertChars) || undefined : undefined);

/** Drops undefined fields, and the object itself when nothing is left. */
function compact<T extends object>(o: T): T | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(out).length ? out : undefined;
}

function claim(v: unknown): ClaimStyle | undefined {
  if (!v || typeof v !== "object") return undefined;
  const c = v as Record<string, any>;
  const L = CLAIM_LIMITS;
  return compact<ClaimStyle>({
    backgroundColor: hex(c.backgroundColor),
    dim: num(c.dim, L.dim),
    artwork: compact({
      size: num(c.artwork?.size, L.size),
      position: oneOf(c.artwork?.position, ["top", "center", "bottom"] as const),
      radius: num(c.artwork?.radius, L.radius),
      borderWidth: num(c.artwork?.borderWidth, L.borderWidth),
      borderColor: hex(c.artwork?.borderColor),
      shadow: typeof c.artwork?.shadow === "boolean" ? c.artwork.shadow : undefined,
    }),
    text: compact({ size: num(c.text?.size, L.textSize), color: hex(c.text?.color), align: oneOf(c.text?.align, ["left", "center"] as const) }),
    alerts: compact({
      aligning: copy(c.alerts?.aligning),
      hintForge: copy(c.alerts?.hintForge),
      hintSecure: copy(c.alerts?.hintSecure),
      failed: copy(c.alerts?.failed),
      color: hex(c.alerts?.color),
      background: hex(c.alerts?.background),
    }),
  });
}

/** Keeps only known slots and values within CLAIM_LIMITS; anything else is dropped. */
export function sanitizeTheme(input: unknown): KeystoneTheme {
  const t = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const slot = <K extends string>(key: K, m: ThemeMedia | undefined) => (m ? ({ [key]: m } as Record<K, ThemeMedia>) : undefined);
  const out: KeystoneTheme = {
    background: slot("media", media(t.background?.media)),
    gallery: slot("banner", media(t.gallery?.banner)),
    claim: claim(t.claim),
  };
  for (const k of Object.keys(out) as (keyof KeystoneTheme)[]) if (!out[k]) delete out[k];
  return out;
}

/** ipfs://<cid> → gateway URL; everything else unchanged. */
export function mediaUrl(src: string): string {
  if (!src.startsWith("ipfs://")) return src;
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";
  return `https://${gw}/ipfs/${src.slice(7)}`;
}
