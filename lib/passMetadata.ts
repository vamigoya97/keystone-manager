import type { Keystone, KeystoneTrait } from "./keystones";

/** Limits for text written into a KeystonePass (storage gas grows with length). */
export const PASS_LIMITS = { name: 64, symbol: 12, description: 500 };

// Allow tab and newline (escaped on chain); reject other control characters.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Trimmed text, or an error message when it can't go on chain. */
export function cleanText(
  value: unknown,
  label: string,
  max: number,
  { required = false } = {}
): { value: string } | { error: string } {
  const v = typeof value === "string" ? value.trim() : "";
  if (required && !v) return { error: `${label} is required` };
  if (v.length > max) return { error: `${label} must be ${max} characters or fewer` };
  if (CONTROL.test(v)) return { error: `${label} contains unsupported characters` };
  return { value: v };
}

/** Limits for operator traits (each one adds to the contract's stored attributes). */
export const TRAIT_LIMITS = { count: 20, key: 40, value: 100 };

/** Trait names the app sets itself, so operators can't add a second one. */
const RESERVED_TRAITS = ["location", "start date", "end date"];

/**
 * Validate operator traits: rows left fully empty are dropped; a key needs a value
 * (and the other way round), keys are unique, and Number traits must be numbers.
 */
export function cleanTraits(input: unknown): { value: KeystoneTrait[] } | { error: string } {
  if (!Array.isArray(input)) return { value: [] };
  const out: KeystoneTrait[] = [];
  const seen = new Set<string>();
  for (const row of input as Record<string, unknown>[]) {
    const key = cleanText(row?.key, "A trait name", TRAIT_LIMITS.key);
    const value = cleanText(row?.value, "A trait value", TRAIT_LIMITS.value);
    if ("error" in key) return key;
    if ("error" in value) return value;
    if (!key.value && !value.value) continue;
    if (!key.value) return { error: `Add a name for the trait "${value.value}"` };
    if (!value.value) return { error: `Add a value for "${key.value}"` };
    const lower = key.value.toLowerCase();
    if (RESERVED_TRAITS.includes(lower)) return { error: `"${key.value}" is set automatically; use another name` };
    if (seen.has(lower)) return { error: `"${key.value}" is listed twice` };
    seen.add(lower);
    const type = row?.type === "number" ? "number" : "text";
    if (type === "number" && !Number.isFinite(Number(value.value))) return { error: `"${key.value}" is a Number trait, so its value must be a number` };
    out.push({ key: key.value, value: value.value, ...(type === "number" ? { type } : {}) });
  }
  if (out.length > TRAIT_LIMITS.count) return { error: `Up to ${TRAIT_LIMITS.count} traits` };
  return { value: out };
}

/** One OpenSea-style trait. Dates are unix seconds with display_type "date". */
export type PassAttribute = { trait_type: string; value: string | number; display_type?: "date" | "number" };

/** What a KeystonePass stores as metadata (the contract's `Metadata` struct). */
export interface PassMetadata {
  description: string;
  /** ipfs://<cid> (or https URL) of the artwork. */
  image: string;
  inscription: string;
  externalUrl: string;
  animationUrl: string;
  /** Six hex digits, no "#". */
  backgroundColor: string;
  /** Comma-separated JSON attribute objects without the surrounding [ ]. */
  attributes: string;
}

/** Image reference to commit: content-addressed ipfs:// when we have the CID. */
export function passImage(exp: Keystone): string {
  if (exp.tokenImageCid) return `ipfs://${exp.tokenImageCid}`;
  return exp.tokenImage ?? "";
}

/** Video artwork to commit as animation_url, when the keystone's artwork is a looping video. */
function passAnimation(exp: Keystone): string {
  if (exp.tokenVideoCid) return `ipfs://${exp.tokenVideoCid}`;
  return exp.tokenVideo ?? "";
}

const unixDay = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 1000;

/** Traits from the keystone's Details (location and dates), then the operator's own. */
export function passAttributes(exp: Keystone): PassAttribute[] {
  const attrs: (PassAttribute | null)[] = [
    exp.location ? { trait_type: "Location", value: exp.location } : null,
    exp.startDate ? { trait_type: "Start Date", value: unixDay(exp.startDate), display_type: "date" as const } : null,
    exp.endDate && exp.endDate !== exp.startDate ? { trait_type: "End Date", value: unixDay(exp.endDate), display_type: "date" as const } : null,
    ...(exp.traits ?? []).map((t) =>
      t.type === "number" ? { trait_type: t.key, value: Number(t.value), display_type: "number" as const } : { trait_type: t.key, value: t.value }
    ),
  ];
  return attrs.filter((a): a is PassAttribute => a !== null);
}

export type PassContent = { name: string; symbol: string; metadata: PassMetadata };

/**
 * Everything a keystone commits on chain, taken from its Details (name, symbol,
 * description, dates, location, traits, colors) and artwork (image,
 * plus the looping video as animation_url when there is one). `baseUrl` is the
 * app's public origin for external_url. Returns the first field that can't go on
 * chain as an error, so the operator fixes it in Details.
 */
export function passContent(exp: Keystone, { baseUrl }: { baseUrl: string }): PassContent | { error: string } {
  const name = cleanText(exp.name, "Name", PASS_LIMITS.name, { required: true });
  const symbol = cleanText(exp.token.symbol.toUpperCase().replace(/[^A-Z0-9]/g, ""), "Symbol", PASS_LIMITS.symbol, { required: true });
  const description = cleanText(exp.description, "Description", PASS_LIMITS.description);
  for (const f of [name, symbol, description]) if ("error" in f) return { error: `${f.error} (edit it in Details)` };
  const v = (f: typeof name) => (f as { value: string }).value;

  const color = exp.palette[0]?.replace(/^#/, "").toUpperCase() ?? "";
  return {
    name: v(name),
    symbol: v(symbol),
    metadata: {
      description: v(description),
      image: passImage(exp),
      // The contract keeps an inscription slot; keystones no longer set one, so it stays empty (and out of tokenURI).
      inscription: "",
      externalUrl: new URL(`/x/${exp.slug}`, baseUrl).toString(),
      animationUrl: passAnimation(exp),
      backgroundColor: /^[0-9A-F]{6}$/.test(color) ? color : "",
      attributes: JSON.stringify(passAttributes(exp)).slice(1, -1),
    },
  };
}

/**
 * The tokenURI JSON the contract will return for `tokenId`, mirroring
 * KeystonePass.tokenURI() (key order and omitted empty fields included).
 */
export function passTokenJson(c: PassContent, tokenId: number): Record<string, unknown> {
  const m = c.metadata;
  const attributes = m.attributes ? JSON.parse(`[${m.attributes}]`) : [];
  return {
    name: `${c.name} #${tokenId}`,
    description: m.description,
    image: m.image,
    ...(m.externalUrl && { external_url: m.externalUrl }),
    ...(m.backgroundColor && { background_color: m.backgroundColor }),
    ...(m.animationUrl && { animation_url: m.animationUrl }),
    attributes,
    ...(m.inscription && { inscription: m.inscription }),
  };
}

/** The app's public origin for links committed on chain: APP_URL, else the request's origin. */
export function publicBaseUrl(req: Request): string {
  return process.env.APP_URL || new URL(req.url).origin;
}
