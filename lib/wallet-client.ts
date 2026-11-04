import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { baseSepolia, base } from "viem/chains";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in environment");

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

const chainId = Number(process.env.NEXT_PUBLIC_GATE_CHAIN_ID || "84532");

function getChain(id: number) {
  if (id === 8453) return base;
  return baseSepolia;
}

function getRpc(id: number) {
  if (id === 8453) return "https://mainnet.base.org";
  return "https://sepolia.base.org";
}

export const walletClient = createWalletClient({
  chain: getChain(chainId),
  transport: http(getRpc(chainId)),
  account,
});

export const publicClient = createPublicClient({
  chain: getChain(chainId),
  transport: http(getRpc(chainId)),
});
