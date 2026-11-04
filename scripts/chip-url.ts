/**
 * Generate the URL to write onto an NFC chip.
 *
 *   npx tsx scripts/chip-url.ts <slug> <chipId> [baseUrl]
 *
 * chipId can be the chip's UID or any unique serial you assign to the item.
 * <slug> may be a token's current or old slug; the link uses the current path and
 * is signed with the token's chip scope (its original slug), like the console.
 * Uses TAP_SECRET from .env.local — the same secret the server verifies with.
 */
import { createHmac } from "crypto";
import { config } from "dotenv";
import { chipScopeOf } from "../lib/keystones";
import { getKeystone } from "../lib/store";

config({ path: ".env.local" });

const [arg, chipId, baseUrl = process.env.APP_URL || "http://localhost:3000"] =
  process.argv.slice(2);
const secret = process.env.TAP_SECRET;

if (!arg || !chipId) {
  console.error("Usage: npx tsx scripts/chip-url.ts <slug> <chipId> [baseUrl]");
  process.exit(1);
}
if (!secret) {
  console.error("TAP_SECRET is not set in .env.local");
  process.exit(1);
}

const exp = await getKeystone(arg);
const slug = exp?.slug ?? arg;
const scope = exp ? chipScopeOf(exp) : arg;

// Must match chipSignature() in lib/tap.ts
const sig = createHmac("sha256", secret)
  .update(`chip:${scope}:${chipId}`)
  .digest("base64url")
  .slice(0, 22);

const url = new URL(`/x/${slug}/tap`, baseUrl);
url.searchParams.set("c", chipId);
url.searchParams.set("s", sig);
console.log(url.toString());
