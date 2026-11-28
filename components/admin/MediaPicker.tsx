"use client";

import { useRef, useState } from "react";
import type { ThemeMedia } from "@/lib/keystones";
import { useAuthedFetch } from "@/lib/useAccess";
import { MEDIA_MAX_BYTES, MEDIA_TYPES, VIDEO_MAX_SECONDS } from "@/lib/theme";
import { MediaView } from "@/components/nfc/themed";
import { Button } from "./ui";

type UploadTarget = { slug?: string; endpoint?: string; slot?: "icon" | "background"; imageOnly?: boolean };

export const acceptFor = (imageOnly: boolean) => MEDIA_TYPES.filter((t) => !imageOnly || t.startsWith("image/")).join(",");

/**
 * Checks a file, then uploads it to public IPFS for a customization slot and
 * hands back the media. Shared by MediaPicker and the operator preview.
 */
export function useMediaUpload({ slug, endpoint, slot, imageOnly = false }: UploadTarget, onChange: (m: ThemeMedia) => void) {
  const authedFetch = useAuthedFetch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!MEDIA_TYPES.includes(file.type) || (imageOnly && !file.type.startsWith("image/"))) return setError(imageOnly ? "Use PNG, JPG, WebP, GIF or AVIF" : "Use PNG, JPG, WebP, GIF, AVIF, MP4 or WebM");
    if (file.size > MEDIA_MAX_BYTES) return setError("Keep media under 20 MB");
    if (file.type.startsWith("video/")) {
      const seconds = await videoDuration(file);
      if (seconds > VIDEO_MAX_SECONDS + 0.5) return setError(`Keep videos to ${VIDEO_MAX_SECONDS} seconds or less (this one is ${Math.round(seconds)}s)`);
    }
    setBusy(true);
    try {
      const signRes = await authedFetch(endpoint ?? `/api/admin/keystones/${slug}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, type: file.type, size: file.size, slot }),
      });
      const signData = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(signData.error || "Upload failed");

      // Upload straight to Pinata from the browser: Vercel caps a Function's
      // request body at 4.5 MB, well under the 20 MB this upload allows.
      const form = new FormData();
      form.append("file", file);
      form.append("network", "public");
      const up = await fetch(signData.url, { method: "POST", body: form });
      const upData = await up.json().catch(() => ({}));
      const cid = upData?.data?.cid;
      if (!up.ok || !cid) throw new Error("Upload failed");

      onChange({ src: `https://${signData.gateway}/ipfs/${cid}`, cid, kind: file.type.startsWith("video/") ? "video" : "image" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return { upload, busy, error, setError };
}

/** Upload one image, GIF or short looping video to public IPFS for a customization slot. */
export default function MediaPicker({
  slug,
  endpoint,
  slot,
  imageOnly = false,
  media,
  onChange,
}: UploadTarget & {
  media?: ThemeMedia;
  onChange: (m: ThemeMedia | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy, error } = useMediaUpload({ slug, endpoint, slot, imageOnly }, onChange);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className={`h-14 w-14 shrink-0 overflow-hidden ${slot === "icon" ? "rounded-full" : "rounded-xl"} border border-input bg-background`}>
          {media && <MediaView media={media} className="h-full w-full object-cover" />}
        </div>
        <input
          ref={input}
          type="file"
          accept={acceptFor(imageOnly)}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
        <Button busy={busy} onClick={() => input.current?.click()}>{media ? "Replace" : "Upload"}</Button>
        {media && <Button onClick={() => onChange(undefined)}>Remove</Button>}
        <span className="text-xs text-muted-foreground">{imageOnly ? "Image or GIF" : `Image, GIF, or MP4/WebM up to ${VIDEO_MAX_SECONDS}s`}</span>
      </div>
      {error && <p className="mt-2 text-sm text-rose">{error}</p>}
    </div>
  );
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}
