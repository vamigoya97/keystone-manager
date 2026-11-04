import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { chipScopeOf, itemKeyScope, type Keystone, type ItemBatch } from "./keystones";
import { deriveKeys, ntagConfigured, verifySun } from "./ntag424";
import { recordChipCounter, ReplayError } from "./store";

/**
 * NFC tap verification. Two chip types, chosen per keystone:
 *
 * static (NTAG 213/215) — chips are programmed with
 *   https://<host>/x/<slug>/tap?c=<chipId>&s=<sig>
 * where sig = chipSignature(chipScopeOf(exp), chipId). The scope is the slug the
 * token was created with, so renaming a token (new slug) doesn't break programmed
 * chips; their old /x/<slug> path redirects. Generate URLs in the operator
 * console or with `npx tsx scripts/chip-url.ts <slug> <chipId>`. Signed
 * links stop guessing but not copying.
 *
 * ntag424 (NTAG 424 DNA) — chips append a fresh SUN message on every tap:
 *   https://<host>/x/<slug>/tap?picc_data=<enc>&cmac=<mac>
 * verified in lib/ntag424.ts; each tap's counter is accepted once, so a
 * copied URL is useless.
 *
 * A valid tap sets a short-lived signed cookie scoped to that slug; the
 * mint route requires it, so only someone holding the item can claim.
 */

const TAP_TTL_SECONDS = 60 * 60 * 24; // 24h to finish claiming after a tap

function secret(): string | null {
  return process.env.TAP_SECRET || null;
}

/** Dev convenience: with no TAP_SECRET outside production, any tap passes. */
function devBypass(): boolean {
  return !secret() && process.env.NODE_ENV !== "production";
}

function hmac(data: string): string {
  return createHmac("sha256", secret()!).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function chipSignature(slug: string, chipId: string): string {
  return hmac(`chip:${slug}:${chipId}`).slice(0, 22);
}

export function verifyTap(
  slug: string,
  chipId: string | undefined,
  sig: string | undefined
): boolean {
  if (devBypass()) return true;
  if (!secret() || !chipId || !sig) return false;
  return safeEqual(chipSignature(slug, chipId), sig);
}

export type TapParams = { c?: string; s?: string; picc_data?: string; cmac?: string };

export type TapVerdict =
  | { ok: true; chipId: string }
  | { ok: false; status: number; error: string };

const CHIP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Verify a tap for an keystone, according to its chip security mode:
 *  ntag424 → SUN message (decrypt, check CMAC, require a fresh counter);
 *            the chip's UID becomes the chip ID
 *  static  → signed static link (?c=<chipId>&s=<sig>)
 */
export async function verifyTapRequest(exp: Keystone, p: TapParams): Promise<TapVerdict> {
  if ((exp.chipSecurity ?? "static") === "ntag424") {
    if (!p.picc_data || !p.cmac) {
      return { ok: false, status: 403, error: "This keystone only aligns with a tap of its original item" };
    }
    if (!ntagConfigured()) {
      return { ok: false, status: 500, error: "Secure chips aren't configured on the server (NTAG_MASTER_KEY)" };
    }
    const sun = verifySun(deriveKeys(chipScopeOf(exp)), p.picc_data, p.cmac);
    if (!sun.ok) return { ok: false, status: 403, error: "Keystone couldn't be aligned" };
    try {
      await recordChipCounter(chipScopeOf(exp), sun.uid, sun.counter);
    } catch (err) {
      if (err instanceof ReplayError) {
        return { ok: false, status: 409, error: "This tap link was already used. Tap your item again." };
      }
      throw err;
    }
    return { ok: true, chipId: sun.uid };
  }

  if ((p.c && !CHIP_ID_RE.test(p.c)) || !verifyTap(chipScopeOf(exp), p.c, p.s)) {
    return { ok: false, status: 403, error: "Keystone couldn't be aligned" };
  }
  return { ok: true, chipId: p.c || "dev" };
}

const cookieName = (slug: string) => `tap_${slug}`;

export async function setTapSession(slug: string, chipId: string) {
  const exp = Math.floor(Date.now() / 1000) + TAP_TTL_SECONDS;
  const payload = `${slug}.${encodeURIComponent(chipId)}.${exp}`;
  const value = devBypass() ? `${payload}.dev` : `${payload}.${hmac(payload)}`;
  (await cookies()).set(cookieName(slug), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TAP_TTL_SECONDS,
  });
}

/**
 * The chip that started this browser's tap session for a token, if still valid. Sessions
 * started under one of the token's previous slugs (before a rename) still count.
 */
export async function getTapSession(
  exp: Pick<Keystone, "slug" | "previousSlugs">
): Promise<{ chipId: string } | null> {
  for (const slug of [exp.slug, ...(exp.previousSlugs ?? [])]) {
    const session = await readTapSession(slug);
    if (session) return session;
  }
  return null;
}

async function readTapSession(slug: string): Promise<{ chipId: string } | null> {
  const raw = (await cookies()).get(cookieName(slug))?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [cookieSlug, chip, exp, sig] = parts;
  if (cookieSlug !== slug) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const valid = devBypass()
    ? true
    : !!secret() && safeEqual(hmac(`${cookieSlug}.${chip}.${exp}`), sig);
  return valid ? { chipId: decodeURIComponent(chip) } : null;
}

/** URL to program onto a chip: the token's current path, signed with its chip scope. Requires TAP_SECRET. */
export function chipUrl(exp: Pick<Keystone, "slug" | "chipScope">, chipId: string, baseUrl: string): string {
  if (!secret()) throw new Error("Set TAP_SECRET to issue chip links");
  const url = new URL(`/x/${exp.slug}/tap`, baseUrl);
  url.searchParams.set("c", chipId);
  url.searchParams.set("s", chipSignature(chipScopeOf(exp), chipId));
  return url.toString();
}

// ── Item links (one physical item → several tokens) ─────────────

/** Signature for a static item link; bound to the batch, not to any one token. */
export function itemChipSignature(batchId: string, chipId: string): string {
  return hmac(`item:${batchId}:${chipId}`).slice(0, 22);
}

/** URL to program onto an item's chip. Requires TAP_SECRET. */
export function itemChipUrl(batchId: string, chipId: string, baseUrl: string): string {
  if (!secret()) throw new Error("Set TAP_SECRET to issue chip links");
  const url = new URL(`/t/${batchId}`, baseUrl);
  url.searchParams.set("c", chipId);
  url.searchParams.set("s", itemChipSignature(batchId, chipId));
  return url.toString();
}

/**
 * Verify a tap on an item, per the batch's chip security. Returns the raw
 * chip id (static id or NTAG 424 UID) on success.
 */
export async function verifyItemTap(batch: ItemBatch, p: TapParams): Promise<TapVerdict> {
  if (batch.chipSecurity === "ntag424") {
    if (!p.picc_data || !p.cmac) return { ok: false, status: 403, error: "This keystone only aligns with a tap of its original item" };
    if (!ntagConfigured()) {
      return { ok: false, status: 500, error: "Secure chips aren't configured on the server (NTAG_MASTER_KEY)" };
    }
    const sun = verifySun(deriveKeys(itemKeyScope(batch.id)), p.picc_data, p.cmac);
    if (!sun.ok) return { ok: false, status: 403, error: "Keystone couldn't be aligned" };
    try {
      await recordChipCounter(itemKeyScope(batch.id), sun.uid, sun.counter);
    } catch (err) {
      if (err instanceof ReplayError) {
        return { ok: false, status: 409, error: "This tap link was already used. Tap your item again." };
      }
      throw err;
    }
    return { ok: true, chipId: sun.uid };
  }

  const chip = p.c;
  if (chip && !CHIP_ID_RE.test(chip)) return { ok: false, status: 403, error: "Keystone couldn't be aligned" };
  if (devBypass()) return { ok: true, chipId: chip || "dev" };
  if (!secret() || !chip || !p.s || !safeEqual(itemChipSignature(batch.id, chip), p.s)) {
    return { ok: false, status: 403, error: "Keystone couldn't be aligned" };
  }
  return { ok: true, chipId: chip };
}
