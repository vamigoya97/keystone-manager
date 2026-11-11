/**
 * Types and defaults for keystones: the one token operators issue.
 *
 * A keystone is an NFC-linked pass (KeystonePass ERC-721) that unlocks a
 * private gallery. It can optionally carry dates and a location, for a
 * gathering or a season; without dates it's ongoing. Each keystone has one
 * link: /x/<slug> (claim), /x/<slug>/tap (chip landing, ?c=<chipId>&s=<sig>)
 * and /x/<slug>/gallery. Operators manage them at /operator.
 *
 * Safe to import on client and server — no secrets live here.
 */

// ── Operators ───────────────────────────────────────────────────

/**
 * An operator is a creator, community or brand (e.g. "GOAT community") that
 * issues keystones. Every keystone belongs to one operator; the console is
 * organized by operator.
 * (Per-operator logins come later; for now one admin allowlist runs everything.)
 */
export interface Operator {
  id: string;
  name: string;
  createdAt: string;
}

export const OPERATOR_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** What a gallery item is. Missing on older items → "image". */
export type GalleryKind = "image" | "video" | "audio" | "qr";

/** One item in a keystone's gallery (the vault): a photo, short clip, audio note or QR code. */
export interface GalleryItem {
  kind?: GalleryKind;
  /**
   * Display URL. For private files this is a stable key (`private:<cid>`);
   * the server swaps in a short-lived signed URL only for holders.
   * QR codes use `qr:<id>` (they have no file).
   */
  src: string;
  /** IPFS CID when the file was uploaded through the admin page. */
  cid?: string;
  /** Stored on Pinata's private network (not reachable via public gateways). */
  private?: boolean;
  /** Pinata file id — needed to delete private files. */
  pinataId?: string;
  /** API responses only: the stored `src`, since `src` there is a rotating signed URL. */
  key?: string;
  /** Title or caption (the file name for uploads, the label for QR codes). */
  alt: string;
  /** Pixel size for photos and clips; audio and QR codes use 1×1. */
  width: number;
  height: number;
  /** Clips and audio notes: length in seconds. */
  duration?: number;
  /** QR codes: the link it encodes (only ever sent to holders, like the files). */
  url?: string;
  /** QR codes: text on the card's front; tapping the card flips it to the code. */
  text?: string;
  /** Spans both columns of the vault (landscape photos and clips, audio notes). */
  wide?: boolean;
  /**
   * Set when an operator has arranged the vault: true = same row as the item
   * before it, false = starts a new row. Unset (never arranged, or added
   * since) = paired automatically.
   */
  sameRow?: boolean;
}

export const galleryKind = (g: Pick<GalleryItem, "kind">): GalleryKind => g.kind ?? "image";

export interface TokenConfig {
  /** Contract address. Undefined → demo mode (dev only, no chain calls). */
  address?: `0x${string}`;
  standard: "erc20" | "erc721";
  symbol: string;
  /** Raw units required to count as a holder (and minted per claim). Decimal string. */
  minBalance: string;
  /** Deployment tx when the contract was deployed from the operator console. */
  deployTx?: string;
}

export interface Keystone {
  /** URL name: /x/<slug>. Follows the token name; see renameKeystone in lib/store. */
  slug: string;
  /** Slugs this token had before a rename. Old links redirect to the current slug. */
  previousSlugs?: string[];
  /** When it was created in the console (ISO). Older keystones don't have it; the store keeps them in creation order. */
  createdAt?: string;
  /**
   * Slug the token's chips are bound to: static link signatures, NTAG 424 key derivation and
   * replay counters. Set to the original slug on the first rename so programmed chips keep working.
   */
  chipScope?: string;
  name: string;
  description: string;
  /** Operator that issued this keystone. */
  operatorId: string;
  /** Optional first day, YYYY-MM-DD. Undated keystones are ongoing. */
  startDate?: string;
  /** Optional last day for multi-day keystones, YYYY-MM-DD. */
  endDate?: string;
  /** Optional place, e.g. "Hills of Sonoma County". */
  location?: string;
  /** Operator-defined traits, committed as contract attributes after the built-in Location and dates. */
  traits?: KeystoneTrait[];
  /** Token artwork. Leave undefined to render the generated placeholder card. */
  tokenImage?: string;
  /** IPFS CID of tokenImage — committed on chain as ipfs://<cid> when a pass is deployed. */
  tokenImageCid?: string;
  /**
   * Optional short looping video artwork (public IPFS, MP4/WebM up to 15 s). When set,
   * tokenImage is its still frame: wallets show the still and play the video.
   */
  tokenVideo?: string;
  /** IPFS CID of tokenVideo — committed on chain as animation_url (ipfs://<cid>). */
  tokenVideoCid?: string;
  /** Two colors used by the placeholder token card + page glow. */
  palette: [string, string];
  token: TokenConfig;
  gallery: GalleryItem[];
  /**
   * Which chips can open a claim session. Missing → "static".
   *  static   NTAG 213/215 with signed static links (?c=&s=); copyable
   *  ntag424  NTAG 424 DNA SUN links (?picc_data=&cmac=); every tap is single-use
   */
  chipSecurity?: ChipSecurity;
  /** Operator customization of the tap, claim and gallery steps. */
  theme?: KeystoneTheme;
}

export type ChipSecurity = "static" | "ntag424";

/** One key–value trait. Numbers are committed as numbers (`display_type: "number"`). */
export interface KeystoneTrait {
  key: string;
  value: string;
  type?: "text" | "number";
}

// ── Customization (operator "Customize" tab) ────────────────────

/** An uploaded image, GIF or short looping video (public IPFS). */
export interface ThemeMedia {
  src: string;
  cid?: string;
  kind: "image" | "video";
}


/**
 * Operator customization: background and banner media (images, GIFs or short
 * looping videos on public IPFS) plus the claim screen's styling. Copy and
 * animations not listed here use the standard look (lib/theme.ts).
 */
export interface KeystoneTheme {
  /** Behind every step. */
  background?: { media?: ThemeMedia };
  /** Gallery: wide banner above the photos (set in the Gallery tab). */
  gallery?: { banner?: ThemeMedia };
  /** Claim screen styling. Every field is optional; lib/theme.ts has the defaults and limits. */
  claim?: ClaimStyle;
}

export type ArtworkPosition = "top" | "center" | "bottom";

export interface ClaimStyle {
  /** Shown behind (or instead of) the background media, as #RRGGBB. */
  backgroundColor?: string;
  /** How much the background media is darkened, 0–80 (%). */
  dim?: number;
  artwork?: {
    /** Width as a share of the 340 px column, 50–100 (%). */
    size?: number;
    position?: ArtworkPosition;
    /** Corner radius, 0–48 px. */
    radius?: number;
    /** Border, 0–8 px, in #RRGGBB. */
    borderWidth?: number;
    borderColor?: string;
    shadow?: boolean;
  };
  /** The description under the artwork. */
  text?: { size?: number; color?: string; align?: "left" | "center" };
  /**
   * Claim wording and alert colors. Empty → standard copy. The slide button's
   * four steps: aligning (keystone tapped), secure (slide), login (signing
   * in), vault (forging; the vault opens on its own).
   */
  alerts?: {
    aligning?: string;
    secure?: string;
    login?: string;
    vault?: string;
    hintForge?: string;
    hintSecure?: string;
    failed?: string;
    color?: string;
    background?: string;
  };
}

/** What non-holders may see: everything except the gallery itself. */
export type PublicKeystone = Omit<Keystone, "gallery"> & { galleryCount: number };

export function toPublic({ gallery, previousSlugs: _p, chipScope: _c, ...rest }: Keystone): PublicKeystone {
  return { ...rest, galleryCount: gallery.length };
}

export interface Member {
  slug: string;
  /** Wallet the pass was minted to (lowercase). */
  address: string;
  privyUserId: string;
  /** Chip that authorized the claim. One wallet per chip. */
  chipId: string;
  claimedAt: string;
  txHash?: string;
  revoked?: boolean;
}

export type KeystonePhase = "upcoming" | "live" | "past";

/** Where a dated keystone sits relative to today (calendar days). Null when it has no dates (ongoing). */
export function keystonePhase(
  exp: Pick<Keystone, "startDate" | "endDate">,
  today: string = new Date().toISOString().slice(0, 10)
): KeystonePhase | null {
  if (!exp.startDate) return null;
  const end = exp.endDate || exp.startDate;
  if (today < exp.startDate) return "upcoming";
  if (today > end) return "past";
  return "live";
}

/** "Nov 22, 2026" or "Nov 22 – 24, 2026"; undefined for undated keystones. */
export function formatDates(exp: Pick<Keystone, "startDate" | "endDate">): string | undefined {
  if (!exp.startDate) return undefined;
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const start = fmt(exp.startDate, { month: "short", day: "numeric", year: "numeric" });
  if (!exp.endDate || exp.endDate === exp.startDate) return start;
  const sameYear = exp.startDate.slice(0, 4) === exp.endDate.slice(0, 4);
  const sameMonth = sameYear && exp.startDate.slice(5, 7) === exp.endDate.slice(5, 7);
  if (sameMonth) {
    // Built from parts: some ICU builds render {day, year} alone as "2026 (day: 24)".
    const [y, , d1] = exp.startDate.split("-");
    const d2 = exp.endDate.split("-")[2];
    return `${fmt(exp.startDate, { month: "short" })} ${Number(d1)} – ${Number(d2)}, ${y}`;
  }
  return `${fmt(exp.startDate, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })} – ${fmt(exp.endDate, { month: "short", day: "numeric", year: "numeric" })}`;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** URL name derived from a token name ("ay.llu Live CDMX" → "ay-llu-live-cdmx"). */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "");
}

/** Scope a token's chips are signed and keyed with; stays fixed across renames. */
export function chipScopeOf(exp: Pick<Keystone, "slug" | "chipScope">): string {
  return exp.chipScope ?? exp.slug;
}

/** Placeholder photos until real media is uploaded for a keystone. */
function placeholderGallery(seed: string, count: number): GalleryItem[] {
  const shapes: [number, number][] = [
    [1200, 1600],
    [1600, 1200],
    [1200, 1200],
    [1200, 1800],
    [1600, 1000],
  ];
  return Array.from({ length: count }, (_, i) => {
    const [width, height] = shapes[i % shapes.length];
    return {
      src: `https://picsum.photos/seed/${seed}-${i}/${width}/${height}`,
      alt: `${seed} photo ${i + 1}`,
      width,
      height,
    };
  });
}

// ── Item batches (one physical item → several tokens) ───────────

/**
 * A batch of physical items (wristbands, pins, tickets) from one operator.
 * Every item in the batch carries its own unique chip link to /t/<batch id>,
 * and unlocks every token listed here — all from the same operator. Adding a
 * token later unlocks it on items already handed out; no reprogramming.
 */
export interface ItemBatch {
  id: string;
  operatorId: string;
  name: string;
  /** Token slugs this batch unlocks, in order. The first is where a tap lands. */
  tokens: string[];
  chipSecurity: ChipSecurity;
  createdAt: string;
}

export const ITEM_BATCH_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** NTAG 424 DNA key scope for a batch — can't collide with token slugs (no "/" allowed there). */
export const itemKeyScope = (batchId: string) => `item-batch/${batchId}`;

/** Chip id recorded on claims made with an item, so one item ↔ one wallet per token. */
export const itemChipId = (batchId: string, chip: string) => `item:${batchId}:${chip}`;

/** Example operators, each with an ongoing and a dated keystone. */
export function exampleOperators(): Operator[] {
  const now = new Date().toISOString();
  return [
    { id: "ay-llu", name: "ay.llu", createdAt: now },
    { id: "goat", name: "GOAT community", createdAt: now },
    { id: "sahar-camp", name: "Sahar Camp", createdAt: now },
  ];
}

const exampleToken = (symbol: string): TokenConfig => ({ standard: "erc721", symbol, minBalance: "1" });

export function exampleKeystones(): Keystone[] {
  return [
    {
      slug: "ayllu-circle",
      operatorId: "ay-llu",
      name: "ay.llu Circle",
      description: "Claim your keystone to unlock studio sessions, behind-the-scenes photos and early drops.",
      palette: ["#F5A524", "#FF5CA8"],
      token: exampleToken("AYLLU"),
      gallery: placeholderGallery("ayllu-circle", 10),
    },
    {
      slug: "ayllu-live-cdmx",
      operatorId: "ay-llu",
      name: "ay.llu Live · Mexico City",
      description: "Tap your wristband to claim the keystone and relive the show through the official photo set.",
      startDate: "2026-09-12",
      location: "Mexico City",
      palette: ["#FF5CA8", "#7B5CFF"],
      token: exampleToken("AYLIVE"),
      gallery: placeholderGallery("ayllu-live-cdmx", 12),
    },
    {
      slug: "goat-members",
      operatorId: "goat",
      name: "GOAT Members",
      description: "Members get the community archive, meetup photos and first access to every GOAT gathering.",
      palette: ["#C8FF2E", "#2EE6FF"],
      token: exampleToken("GOAT"),
      gallery: placeholderGallery("goat-members", 10),
    },
    {
      slug: "goat-summit-2026",
      operatorId: "goat",
      name: "GOAT Summit 2026",
      description: "Attendees claim the summit keystone at the door; photos unlock after the summit.",
      startDate: "2026-11-21",
      endDate: "2026-11-22",
      location: "Los Angeles, CA",
      palette: ["#2EE6FF", "#7B5CFF"],
      token: exampleToken("GSUM26"),
      gallery: placeholderGallery("goat-summit-2026", 8),
    },
    {
      slug: "sahar-family",
      operatorId: "sahar-camp",
      name: "Sahar Camp Family",
      description: "The camp's ongoing keystone: past-year archives, build updates and gatherings between burns.",
      palette: ["#FF7A45", "#7B5CFF"],
      token: exampleToken("SAHAR"),
      gallery: placeholderGallery("sahar-family", 10),
    },
    {
      slug: "sahar-camp-2026",
      operatorId: "sahar-camp",
      name: "Sahar Camp 2026",
      description: "Tap the camp token you were given to claim this year's keystone and the full photo set.",
      startDate: "2026-08-27",
      endDate: "2026-09-03",
      location: "Black Rock Desert, NV",
      palette: ["#FFB547", "#FF7A45"],
      token: exampleToken("SAHAR26"),
      gallery: placeholderGallery("sahar-camp-2026", 14),
    },
  ];
}
