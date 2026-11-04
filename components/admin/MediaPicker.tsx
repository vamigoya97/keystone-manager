"use client";

import { useRef, useState } from "react";
import type { ThemeMedia } from "@/lib/keystones";
import { useAuthedFetch } from "@/lib/useAccess";
import { MEDIA_MAX_BYTES, MEDIA_TYPES, VIDEO_MAX_SECONDS } from "@/lib/theme";
import { MediaView } from "@/components/nfc/themed";
import { Button } from "./ui";

/** Upload one image, GIF or short looping video to public IPFS for a customization slot. */
export default function MediaPicker({
  slug,
  media,
  onChange,
}: {
  slug: string;
  media?: ThemeMedia;
  onChange: (m: ThemeMedia | undefined) => void;
}) {
  const authedFetch = useAuthedFetch();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!MEDIA_TYPES.includes(file.type)) return setError("Use PNG, JPG, WebP, GIF, AVIF, MP4 or WebM");
    if (file.size > MEDIA_MAX_BYTES) return setError("Keep media under 20 MB");
    if (file.type.startsWith("video/")) {
      const seconds = await videoDuration(file);
      if (seconds > VIDEO_MAX_SECONDS + 0.5) return setError(`Keep videos to ${VIDEO_MAX_SECONDS} seconds or less (this one is ${Math.round(seconds)}s)`);
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authedFetch(`/api/admin/keystones/${slug}/media`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onChange(data as ThemeMedia);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border-default bg-surface">
          {media && <MediaView media={media} className="h-full w-full object-cover" />}
        </div>
        <input
          ref={input}
          type="file"
          accept={MEDIA_TYPES.join(",")}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
        <Button busy={busy} onClick={() => input.current?.click()}>{media ? "Replace" : "Upload"}</Button>
        {media && <Button onClick={() => onChange(undefined)}>Remove</Button>}
        <span className="text-[11px] text-text-muted">Image, GIF, or MP4/WebM up to {VIDEO_MAX_SECONDS}s</span>
      </div>
      {error && <p className="mt-2 text-[12px] text-rose">{error}</p>}
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
