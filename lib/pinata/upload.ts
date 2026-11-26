import { PinataSDK } from "pinata";

function gateway(): string {
  return process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";
}

function sdk(): PinataSDK {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT is not set");
  return new PinataSDK({ pinataJwt: jwt, pinataGateway: gateway() });
}

/** A public-IPFS cid's gateway URL. */
export function gatewayUrl(cid: string): string {
  return `https://${gateway()}/ipfs/${cid}`;
}

/**
 * A short-lived URL the browser can POST a file to directly on IPFS,
 * skipping our server (and its platform-imposed request body limit).
 * `network` picks public (gallery banners, token art — anyone can see
 * them) or private (gallery photos — gated to holders). Server-only;
 * uses PINATA_JWT.
 */
export async function createSignedUploadUrl(opts: {
  filename: string;
  mimeTypes: string[];
  maxBytes: number;
  keyvalues: Record<string, string>;
  network?: "public" | "private";
}): Promise<{ url: string; gateway: string }> {
  const upload = sdk().upload[opts.network === "private" ? "private" : "public"];
  const url = await upload.createSignedURL({
    expires: 300,
    name: opts.filename,
    mimeTypes: opts.mimeTypes,
    maxFileSize: opts.maxBytes,
    keyvalues: opts.keyvalues,
  });
  return { url, gateway: gateway() };
}

/** Pin one file to public IPFS directly (server-only; uses PINATA_JWT). For scripts with the file already in hand — pages route uploads through createSignedUploadUrl instead, to stay under Vercel's request body limit. */
export async function pinImage(
  file: File,
  keyvalues: Record<string, string>
): Promise<{ cid: string; url: string }> {
  const { cid } = await sdk().upload.public.file(file).keyvalues(keyvalues);
  return { cid, url: gatewayUrl(cid) };
}
