/**
 * Simulate an NTAG 424 DNA tap: prints the URL a programmed chip would open.
 * Lets you try the secure-chip flow before you have hardware.
 *
 *   npx tsx scripts/ntag424-url.ts <slug> [uid] [counter] [baseUrl]
 *
 *   uid      7-byte chip UID as 14 hex chars (default 04A1B2C3D4E5F6)
 *   counter  tap counter; must increase on every tap (default: seconds since
 *            2024, so successive runs always count up)
 *   baseUrl  defaults to APP_URL or http://localhost:3000
 *
 * Uses NTAG_MASTER_KEY from .env.local — the same key the server verifies with.
 * Each printed URL works once; run again for a new tap.
 */
import { config } from "dotenv";
import { chipScopeOf } from "../lib/keystones";
import { deriveKeys, simulateTap } from "../lib/ntag424";
import { getKeystone } from "../lib/store";

config({ path: ".env.local" });

const [arg, uid = "04A1B2C3D4E5F6", counterArg, baseUrl = process.env.APP_URL || "http://localhost:3000"] =
  process.argv.slice(2);

if (!arg) {
  console.error("Usage: npx tsx scripts/ntag424-url.ts <slug> [uid] [counter] [baseUrl]");
  process.exit(1);
}

const counter = counterArg ? Number(counterArg) : Math.floor((Date.now() - Date.UTC(2024, 0, 1)) / 1000) % 0xffffff;
// Old slugs resolve to the token; keys come from its chip scope (original slug).
const exp = await getKeystone(arg);
const slug = exp?.slug ?? arg;
const { picc_data, cmac } = simulateTap(deriveKeys(exp ? chipScopeOf(exp) : arg), uid.toUpperCase(), counter);

const url = new URL(`/x/${slug}/tap`, baseUrl);
url.searchParams.set("picc_data", picc_data);
url.searchParams.set("cmac", cmac);
console.log(url.toString());
