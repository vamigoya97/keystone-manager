"use client";

/* eslint-disable @next/next/no-img-element */
import type { ThemeMedia } from "@/lib/keystones";
import { mediaUrl } from "@/lib/theme";

/** An uploaded image/GIF, or a short video played muted on loop. */
export function MediaView({
  media,
  className = "",
  alt = "",
}: {
  media: ThemeMedia;
  className?: string;
  alt?: string;
}) {
  const src = mediaUrl(media.src);
  return media.kind === "video" ? (
    <video src={src} className={className} autoPlay muted loop playsInline aria-hidden={!alt} />
  ) : (
    <img src={src} alt={alt} className={className} />
  );
}

/** Full-bleed background media under a dimming layer. */
export function BackgroundLayer({ media, dim }: { media?: ThemeMedia; dim: number }) {
  if (!media) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <MediaView media={media} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-surface" style={{ opacity: dim / 100 }} />
    </div>
  );
}
