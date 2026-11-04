// Verify that a private key maps to the expected address.
//
// Usage:
//   PRIVATE_KEY=0x... EXPECTED_ADDR=0x... npx tsx scripts/verify-key.ts

import { privateKeyToAccount } from "viem/accounts";

const rawKey = process.env.PRIVATE_KEY;
const expectedAddr = process.env.EXPECTED_ADDR;

if (!rawKey || !expectedAddr) {
  console.error("Usage: PRIVATE_KEY=0x... EXPECTED_ADDR=0x... npx tsx scripts/verify-key.ts");
  process.exit(1);
}

// Normalize: ensure 0x prefix + exactly 64 hex chars
let key = rawKey.trim();
if (!key.startsWith("0x")) key = "0x" + key;
key = "0x" + key.slice(2).padStart(64, "0");

try {
  const account = privateKeyToAccount(key as `0x${string}`);
  const derived = account.address.toLowerCase();
  const expected = expectedAddr.toLowerCase();

  console.log("Key derives to:", derived);
  console.log("Expected addr :", expected);

  if (derived === expected) {
    console.log("\n✅ MATCH — key is correct for this address");
  } else {
    console.log("\n❌ MISMATCH — this private key does NOT own that address");
    console.log("   Possible causes:");
    console.log("   - You copied the address, not the private key");
    console.log("   - You're looking at a different MetaMask account");
    console.log("   - Extra characters got copied (check for spaces/newlines)");
  }
} catch (err: any) {
  console.error("Error parsing key:", err.message);
  console.log("Make sure it's exactly 64 hex chars after 0x");
}