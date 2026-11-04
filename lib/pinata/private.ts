import type { GalleryItem } from "@/lib/keystones";

/**
 * Pinata private IPFS (Files API v3).
 *
 * Private files are not served by any public IPFS gateway. They are only
 * viewable through short-lived signed URLs on your dedicated gateway,
 * which the server creates for verified holders.
 *
 * Requires:
 *   PINATA_JWT                  — key with org:files:write
 *   NEXT_PUBLIC_PINATA_GATEWAY  — dedicated gateway, e.g. yourname.mypinata.cloud
 */

const API = "https://api.pinata.cloud/v3";
const SIGNED_TTL_S = 60 * 60; // holders' links last 1h
const REUSE_MARGIN_S = 10 * 60; // re-sign when <10 min left

function jwt(): string {
  const v = process.env.PINATA_JWT;
  if (!v) throw new Error("PINATA_JWT is not set");
  return v;
}

function gateway(): string {
  const g = process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  if (!g || g === "gateway.pinata.cloud") {
    throw new Error(
      "Private files need a dedicated gateway: set NEXT_PUBLIC_PINATA_GATEWAY to yourname.mypinata.cloud"
    );
  }
  return g.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function uploadPrivate(
  file: File,
  keyvalues: Record<string, string>
): Promise<{ id: string; cid: string }> {
  gateway(); // fail before uploading if files couldn't be served afterwards

  const form = new FormData();
  form.append("file", file);
  form.append("network", "private");
  form.append("name", file.name);
  form.append("keyvalues", JSON.stringify(keyvalues));

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata upload failed (${res.status}): ${await res.text()}`);
  const { data } = (await res.json()) as { data: { id: string; cid: string } };
  return { id: data.id, cid: data.cid };
}

export async function deletePrivate(id: string, cid?: string): Promise<void> {
  const res = await fetch(`${API}/files/private/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt()}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Pinata delete failed (${res.status})`);
  }
  if (cid) signed.delete(cid);
}

// cid → { url, expiresAt(s) }. Signing is one API call per image, so reuse.
const signed = new Map<string, { url: string; exp: number }>();

async function signedUrl(cid: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const hit = signed.get(cid);
  if (hit && hit.exp - now > REUSE_MARGIN_S) return hit.url;

  const res = await fetch(`${API}/files/private/download_link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `https://${gateway()}/files/${cid}`,
      date: now,
      expires: SIGNED_TTL_S,
      method: "GET",
    }),
  });
  if (!res.ok) throw new Error(`Pinata signing failed (${res.status})`);
  const { data } = (await res.json()) as { data: string };
  signed.set(cid, { url: data, exp: now + SIGNED_TTL_S });
  return data;
}

/**
 * Swap private images' placeholder src for signed URLs. Call only after
 * access has been verified. `key` keeps the stable id for admin actions.
 */
export async function resolveGallery(
  images: GalleryItem[]
): Promise<(GalleryItem & { key: string })[]> {
  return Promise.all(
    images.map(async (img) => ({
      ...img,
      key: img.src,
      src: img.private && img.cid ? await signedUrl(img.cid) : img.src,
    }))
  );
}
