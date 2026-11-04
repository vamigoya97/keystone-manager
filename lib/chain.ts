import {
  encodeDeployData,
  erc20Abi,
  erc721Abi,
  formatEther,
  parseAbi,
  type Address,
} from "viem";
import type { TokenConfig } from "./keystones";
import passArtifact from "./keystone-pass.json";
import type { PassMetadata } from "./passMetadata";

/**
 * Server-only chain helpers. Every write is signed and paid for by the
 * operator wallet (PRIVATE_KEY) so holders never need ETH.
 */

// Lazy so routes that never touch the chain (demo mode) don't need PRIVATE_KEY.
const clients = () => import("./wallet-client");

const MINT_ABI = {
  erc20: parseAbi(["function mint(address to, uint256 quantity) payable"]),
  erc721: parseAbi(["function mint(address to)"]),
};

/** Rough gas for one operator-paid mint — used for the runway estimate. */
const MINT_GAS = BigInt(120_000);

/**
 * Does any of the wallets hold at least `minBalance` of the token?
 * By default a failed read counts as zero; with `strict`, network errors
 * are thrown so callers can tell "holds nothing" from "couldn't check".
 */
export async function holdsToken(
  token: TokenConfig,
  wallets: string[],
  { strict = false } = {}
): Promise<boolean> {
  if (!token.address || wallets.length === 0) return false;
  const { publicClient } = await clients();
  const min = BigInt(token.minBalance);
  const balances = await Promise.all(
    wallets.map((w) => {
      const read = publicClient.readContract({
        address: token.address!,
        abi: token.standard === "erc20" ? erc20Abi : erc721Abi,
        functionName: "balanceOf",
        args: [w as Address],
      });
      return strict ? read : read.catch(() => BigInt(0));
    })
  );
  return balances.some((b) => b >= min);
}

export async function mintTo(token: TokenConfig, to: Address) {
  const { walletClient, publicClient } = await clients();
  const hash =
    token.standard === "erc20"
      ? await walletClient.writeContract({
          address: token.address!,
          abi: MINT_ABI.erc20,
          functionName: "mint",
          args: [to, BigInt(token.minBalance)],
        })
      : await walletClient.writeContract({
          address: token.address!,
          abi: MINT_ABI.erc721,
          functionName: "mint",
          args: [to],
        });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Mint reverted on chain");
  return { hash, explorerUrl: `${explorerBase(publicClient.chain)}/tx/${hash}` };
}

export interface PassDeploy {
  name: string;
  symbol: string;
  metadata: PassMetadata;
  /** Lock the metadata permanently at deploy time. */
  freeze: boolean;
  /** false = soulbound: passes can't move between wallets. */
  transferable: boolean;
}

const passAbi = passArtifact.abi;
const passBytecode = passArtifact.bytecode as `0x${string}`;

async function passDeployData(p: PassDeploy) {
  const { walletClient } = await clients();
  return encodeDeployData({
    abi: passAbi,
    bytecode: passBytecode,
    args: [p.name, p.symbol, p.metadata, p.freeze, p.transferable, walletClient.account.address],
  });
}

/** Gas + ETH the operator wallet would pay to deploy this pass. */
export async function estimatePassDeploy(p: PassDeploy) {
  const { walletClient, publicClient } = await clients();
  const [gas, gasPrice, balance] = await Promise.all([
    publicClient.estimateGas({ account: walletClient.account, data: await passDeployData(p) }),
    publicClient.getGasPrice(),
    publicClient.getBalance({ address: walletClient.account.address }),
  ]);
  const cost = gas * gasPrice;
  return { gas: gas.toString(), costEth: formatEther(cost), affordable: balance >= cost };
}

/** Deploy a KeystonePass, owned by the operator wallet, with on-chain metadata. */
export async function deployKeystonePass(p: PassDeploy) {
  const { walletClient, publicClient } = await clients();
  const hash = await walletClient.sendTransaction({ data: await passDeployData(p) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("Deployment failed");
  }
  return {
    address: receipt.contractAddress,
    hash,
    explorerUrl: `${explorerBase(publicClient.chain)}/tx/${hash}`,
  };
}

/** Rewrite a pass's on-chain metadata (reverts once frozen). */
export async function setPassMetadata(address: Address, m: PassMetadata) {
  const { walletClient, publicClient } = await clients();
  const hash = await walletClient.writeContract({
    address,
    abi: passAbi,
    functionName: "setMetadata",
    args: [m],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Metadata update reverted");
  return { hash, explorerUrl: `${explorerBase(publicClient.chain)}/tx/${hash}` };
}

/** Permanently lock a pass's metadata. */
export async function freezePassMetadata(address: Address) {
  return passWrite(address, "freezeMetadata", []);
}

/** Allow (true) or block (false, soulbound) wallet-to-wallet transfers. */
export async function setPassTransferable(address: Address, transferable: boolean) {
  return passWrite(address, "setTransferable", [transferable]);
}

/** Permanently fix the current transfer rule. */
export async function freezePassTransferRule(address: Address) {
  return passWrite(address, "freezeTransferRule", []);
}

async function passWrite(address: Address, functionName: string, args: unknown[]) {
  const { walletClient, publicClient } = await clients();
  const hash = await walletClient.writeContract({ address, abi: passAbi, functionName, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return { hash, explorerUrl: `${explorerBase(publicClient.chain)}/tx/${hash}` };
}

/**
 * Read what a KeystonePass has committed on chain. Returns null for
 * contracts that aren't KeystonePass (e.g. a linked ERC-20).
 */
export async function readPassMetadata(address: Address) {
  const { publicClient } = await clients();
  const read = (functionName: string) => publicClient.readContract({ address, abi: passAbi, functionName });
  try {
    const [m, frozen] = await Promise.all([read("metadata"), read("metadataFrozen")]);
    const [description, image, inscription, externalUrl, animationUrl, backgroundColor, attributes] = m as string[];
    const transfer = await Promise.all([read("transferable"), read("transferRuleFrozen")]).catch(() => null);
    return {
      description,
      image,
      inscription,
      externalUrl,
      animationUrl,
      backgroundColor,
      attributes,
      frozen: frozen as boolean,
      /** null when the contract predates the transfer lock. */
      transferable: transfer ? (transfer[0] as boolean) : null,
      transferRuleFrozen: transfer ? (transfer[1] as boolean) : null,
    };
  } catch {
    return null;
  }
}

export async function operatorWallet() {
  const { walletClient, publicClient } = await clients();
  const address = walletClient.account.address;
  const [balance, gasPrice] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.getGasPrice(),
  ]);
  const perMint = gasPrice * MINT_GAS;
  return {
    address,
    chain: publicClient.chain?.name ?? "unknown",
    balanceEth: formatEther(balance),
    costPerMintEth: formatEther(perMint),
    mintsRemaining: perMint > BigInt(0) ? Number(balance / perMint) : null,
    explorerUrl: `${explorerBase(publicClient.chain)}/address/${address}`,
  };
}

export async function tokenStats(token: TokenConfig) {
  if (!token.address) return null;
  const { publicClient } = await clients();
  const read = (functionName: "name" | "totalSupply") =>
    publicClient
      .readContract({
        address: token.address!,
        abi: parseAbi(["function name() view returns (string)", "function totalSupply() view returns (uint256)"]),
        functionName,
      })
      .catch(() => null);
  const [name, totalSupply, onchain] = await Promise.all([
    read("name"),
    read("totalSupply"),
    token.standard === "erc721" ? readPassMetadata(token.address) : Promise.resolve(null),
  ]);
  return {
    name: name as string | null,
    totalSupply: totalSupply === null ? null : String(totalSupply),
    explorerUrl: `${explorerBase(publicClient.chain)}/address/${token.address}`,
    /** On-chain metadata when the contract is a KeystonePass. */
    onchain,
  };
}

function explorerBase(chain: { blockExplorers?: { default: { url: string } } } | undefined) {
  return chain?.blockExplorers?.default.url ?? "https://sepolia.basescan.org";
}

