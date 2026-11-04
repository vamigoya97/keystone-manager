/**
 * Public reference links for a deployed keystone contract. Client-safe: built from
 * the address and NEXT_PUBLIC_GATE_CHAIN_ID, so they work even when the RPC can't
 * be reached. Base (8453) uses basescan.org and opensea.io; Base Sepolia (84532,
 * the default) uses sepolia.basescan.org. OpenSea closed its testnet site, so there's
 * no OpenSea link on Base Sepolia.
 */
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_GATE_CHAIN_ID || "84532");

export function contractLinks(address: string, chainId = CHAIN_ID) {
  const mainnet = chainId === 8453;
  const scan = mainnet ? "https://basescan.org" : "https://sepolia.basescan.org";
  const opensea = `https://opensea.io/assets/base/${address}`;
  return {
    network: mainnet ? "Base" : "Base Sepolia",
    scanName: mainnet ? "BaseScan" : "BaseScan (Sepolia)",
    scanContract: `${scan}/address/${address}`,
    scanToken: `${scan}/token/${address}`,
    scanTx: (hash: string) => `${scan}/tx/${hash}`,
    scanNft: (tokenId: number | string) => `${scan}/nft/${address}/${tokenId}`,
    /** OpenSea only lists mainnet collections. */
    opensea: mainnet ? { collection: opensea, token: (tokenId: number | string) => `${opensea}/${tokenId}` } : null,
  };
}
