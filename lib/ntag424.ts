import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";

/**
 * NTAG 424 DNA — Secure Unique NFC (SUN) message verification.
 *
 * A provisioned chip appends two values to its URL on every tap
 * (NXP AN12196, "SUN with encrypted PICC data"):
 *
 *   picc_data  AES-128 encrypted [tag | UID(7) | SDMReadCtr(3, LSB first) | pad]
 *   cmac       8-byte truncated AES-CMAC under a session key derived from the
 *              chip's file-read key, its UID and the counter
 *
 * The counter increments on every tap, so each URL is single-use: the
 * server rejects counters it has already seen (see recordChipCounter).
 *
 * Keys are derived per keystone from NTAG_MASTER_KEY, so a whole batch of
 * chips for one keystone can be programmed identically (factory-friendly),
 * and a chip programmed for one keystone can't open another.
 */

const BLOCK = 16;
const ZERO_IV = Buffer.alloc(BLOCK);

// ── AES-CMAC (RFC 4493) ─────────────────────────────────────────

function aesEcbEncrypt(key: Buffer, block: Buffer): Buffer {
  const c = createCipheriv("aes-128-ecb", key, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(block), c.final()]);
}

function aesEcbDecrypt(key: Buffer, block: Buffer): Buffer {
  const d = createDecipheriv("aes-128-ecb", key, null);
  d.setAutoPadding(false);
  return Buffer.concat([d.update(block), d.final()]);
}

/** Left-shift by one bit; XOR 0x87 into the last byte when the MSB was set. */
function dbl(b: Buffer): Buffer {
  const out = Buffer.alloc(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    out[i] = ((b[i] << 1) | (i + 1 < BLOCK ? b[i + 1] >> 7 : 0)) & 0xff;
  }
  if (b[0] & 0x80) out[BLOCK - 1] ^= 0x87;
  return out;
}

export function aesCmac(key: Buffer, message: Buffer): Buffer {
  const L = aesEcbEncrypt(key, ZERO_IV);
  const k1 = dbl(L);
  const k2 = dbl(k1);

  const n = Math.max(1, Math.ceil(message.length / BLOCK));
  const complete = message.length > 0 && message.length % BLOCK === 0;

  const last = Buffer.alloc(BLOCK);
  const tail = message.subarray((n - 1) * BLOCK);
  tail.copy(last);
  if (!complete) last[tail.length] = 0x80;
  const sub = complete ? k1 : k2;
  for (let i = 0; i < BLOCK; i++) last[i] ^= sub[i];

  let x: Buffer = Buffer.alloc(BLOCK);
  for (let i = 0; i < n - 1; i++) {
    const y = Buffer.alloc(BLOCK);
    for (let j = 0; j < BLOCK; j++) y[j] = x[j] ^ message[i * BLOCK + j];
    x = aesEcbEncrypt(key, y);
  }
  for (let j = 0; j < BLOCK; j++) last[j] ^= x[j];
  return aesEcbEncrypt(key, last);
}

// ── Key derivation ──────────────────────────────────────────────

export type Ntag424Keys = {
  /** Key 0 — application master key (replaces the factory default). */
  appMaster: Buffer;
  /** SDMMetaReadKey — decrypts picc_data. */
  metaRead: Buffer;
  /** SDMFileReadKey — base for the per-tap CMAC session key. */
  fileRead: Buffer;
};

function masterKey(): Buffer {
  const hex = process.env.NTAG_MASTER_KEY;
  if (!hex || !/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error("NTAG_MASTER_KEY must be set to 32 hex characters (16 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function ntagConfigured(): boolean {
  return /^[0-9a-fA-F]{32}$/.test(process.env.NTAG_MASTER_KEY ?? "");
}

/** Per-keystone keys: AES-CMAC(master, label || 0x00 || slug). */
export function deriveKeys(slug: string, master: Buffer = masterKey()): Ntag424Keys {
  const kdf = (label: string) =>
    aesCmac(master, Buffer.concat([Buffer.from(label), Buffer.from([0]), Buffer.from(slug, "utf8")]));
  return { appMaster: kdf("ntag424/app"), metaRead: kdf("ntag424/meta"), fileRead: kdf("ntag424/file") };
}

// ── SUN verification ────────────────────────────────────────────

export type SunResult =
  | { ok: true; uid: string; counter: number }
  | { ok: false; error: string };

const HEX32 = /^[0-9a-fA-F]{32}$/;
const HEX16 = /^[0-9a-fA-F]{16}$/;

/** Session MAC key: AES-CMAC(fileRead, 3CC3 0001 0080 || UID || ctr). */
function sessionMacKey(fileRead: Buffer, uid: Buffer, ctr: Buffer): Buffer {
  const sv2 = Buffer.concat([Buffer.from([0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80]), uid, ctr]);
  return aesCmac(fileRead, sv2);
}

/** SDM truncation: the odd-indexed bytes of the full CMAC (8 of 16). */
function truncateMac(full: Buffer): Buffer {
  return Buffer.from([1, 3, 5, 7, 9, 11, 13, 15].map((i) => full[i]));
}

/**
 * Verify a SUN tap. `macInput` is the ASCII data the chip MACs; with the
 * recommended config (SDMMACInputOffset == SDMMACOffset) it is empty.
 */
export function verifySun(
  keys: Pick<Ntag424Keys, "metaRead" | "fileRead">,
  piccDataHex: string,
  cmacHex: string,
  macInput: Buffer = Buffer.alloc(0)
): SunResult {
  if (!HEX32.test(piccDataHex) || !HEX16.test(cmacHex)) {
    return { ok: false, error: "Malformed chip data" };
  }

  const plain = aesEcbDecrypt(keys.metaRead, Buffer.from(piccDataHex, "hex"));
  const tag = plain[0];
  const uidMirrored = (tag & 0x80) !== 0;
  const ctrMirrored = (tag & 0x40) !== 0;
  const uidLength = tag & 0x0f;
  if (!uidMirrored || !ctrMirrored || uidLength !== 7) {
    return { ok: false, error: "Chip not recognised" };
  }

  const uid = plain.subarray(1, 8);
  const ctr = plain.subarray(8, 11);
  const expected = truncateMac(aesCmac(sessionMacKey(keys.fileRead, uid, ctr), macInput));
  if (!timingSafeEqual(expected, Buffer.from(cmacHex, "hex"))) {
    return { ok: false, error: "Chip signature invalid" };
  }

  return {
    ok: true,
    uid: uid.toString("hex").toUpperCase(),
    counter: ctr[0] | (ctr[1] << 8) | (ctr[2] << 16),
  };
}

/**
 * Produce the picc_data/cmac a provisioned chip would emit. For tests and
 * for trying the flow without hardware (scripts/ntag424-url.ts).
 */
export function simulateTap(
  keys: Pick<Ntag424Keys, "metaRead" | "fileRead">,
  uidHex: string,
  counter: number
): { picc_data: string; cmac: string } {
  const uid = Buffer.from(uidHex, "hex");
  if (uid.length !== 7) throw new Error("UID must be 7 bytes (14 hex characters)");
  const ctr = Buffer.from([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff]);
  const plain = Buffer.concat([Buffer.from([0xc7]), uid, ctr, randomBytes(5)]);
  return {
    picc_data: aesEcbEncrypt(keys.metaRead, plain).toString("hex").toUpperCase(),
    cmac: truncateMac(aesCmac(sessionMacKey(keys.fileRead, uid, ctr), Buffer.alloc(0)))
      .toString("hex")
      .toUpperCase(),
  };
}

// ── Provisioning sheet ──────────────────────────────────────────

const PICC_PLACEHOLDER = "0".repeat(32);
const CMAC_PLACEHOLDER = "0".repeat(16);

/**
 * Everything needed to program chips for an keystone: the NDEF URL
 * template and the byte offsets SDM mirrors into, for an NDEF file holding
 * one URI record with the "https://" prefix code (0x04).
 */
export function provisioningSheet(
  slug: string,
  baseUrl: string,
  /** Program chips for something other than one token (e.g. an item batch). */
  target: { keyScope: string; path: string } = { keyScope: slug, path: `/x/${slug}/tap` }
) {
  const keys = deriveKeys(target.keyScope);
  const url = new URL(target.path, baseUrl);
  url.searchParams.set("picc_data", PICC_PLACEHOLDER);
  url.searchParams.set("cmac", CMAC_PLACEHOLDER);
  const template = url.toString().replace(/%3D/g, "=");

  if (!template.startsWith("https://")) {
    throw new Error("Chips need an https:// base URL");
  }
  const body = template.slice("https://".length);
  if (body.length + 1 > 250) throw new Error("URL too long for a short-record NDEF message");

  // File layout: NLEN(2) | D1 01 <payloadLen> 55 | 04 | body
  const header = 2 + 4 + 1;
  const piccOffset = header + body.indexOf(`picc_data=${PICC_PLACEHOLDER}`) + "picc_data=".length;
  const macOffset = header + body.indexOf(`cmac=${CMAC_PLACEHOLDER}`) + "cmac=".length;
  const hex3 = (n: number) => n.toString(16).toUpperCase().padStart(6, "0");

  return {
    urlTemplate: template,
    keys: {
      key0AppMaster: keys.appMaster.toString("hex").toUpperCase(),
      key1SdmMetaRead: keys.metaRead.toString("hex").toUpperCase(),
      key2SdmFileRead: keys.fileRead.toString("hex").toUpperCase(),
    },
    sdm: {
      file: "NDEF file (E104h / file 02)",
      options: "UID mirror + SDMReadCtr mirror, encrypted PICC data, ASCII encoding",
      metaReadKey: "Key 1",
      fileReadKey: "Key 2",
      piccDataOffset: { decimal: piccOffset, hex: hex3(piccOffset) },
      macInputOffset: { decimal: macOffset, hex: hex3(macOffset) },
      macOffset: { decimal: macOffset, hex: hex3(macOffset) },
      note: "SDMMACInputOffset = SDMMACOffset, so the MAC covers no extra data.",
    },
  };
}
