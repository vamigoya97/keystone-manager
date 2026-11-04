import type { GalleryKind } from "./keystones";

/**
 * What can go in a keystone's gallery (the vault) and how big it can be.
 * Client-safe: the Gallery tab checks these before uploading and the
 * server checks them again.
 */
export const GALLERY_LIMITS = {
  image: { bytes: 25 * 1024 * 1024 },
  video: { bytes: 100 * 1024 * 1024, seconds: 60 },
  audio: { bytes: 25 * 1024 * 1024, seconds: 10 * 60 },
} as const;

export const GALLERY_TYPES: Record<"image" | "video" | "audio", string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg"],
};

export const QR_LIMITS = { url: 500, label: 80 };

/** Which kind of upload a MIME type is, or null when it isn't allowed. */
export function uploadKind(type: string): "image" | "video" | "audio" | null {
  for (const kind of ["image", "video", "audio"] as const) if (GALLERY_TYPES[kind].includes(type)) return kind;
  return null;
}

/** A QR code's link: http(s) only, so a scan can't run script or open odd schemes. */
export function cleanQrUrl(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v || v.length > QR_LIMITS.url) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** 0:12, 4:05 */
export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const KIND_LABEL: Record<GalleryKind, string> = { image: "Photo", video: "Clip", audio: "Audio note", qr: "QR code" };
