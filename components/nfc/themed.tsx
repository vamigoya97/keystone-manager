"use client";

/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
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

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 13) % 10) / 20,
  dur: 1.8 + ((i * 7) % 10) / 10,
  drift: ((i * 29) % 80) - 40,
  spin: 360 + ((i * 53) % 540),
}));

/** One-shot confetti after a successful forge, in the keystone's colors. */
export function CelebrationLayer({
  palette,
  absolute = false,
}: {
  palette: [string, string];
  /** Contain within the parent (preview) instead of the viewport. */
  absolute?: boolean;
}) {
  const box = `${absolute ? "absolute" : "fixed"} pointer-events-none inset-0 z-40 overflow-hidden`;
  const colors = [palette[0], palette[1], "#ffffff"];
  return (
    <div aria-hidden className={box}>
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${c.left}%`,
              background: colors[i % colors.length],
              "--delay": `${c.delay}s`,
              "--dur": `${c.dur}s`,
              "--drift": `${c.drift}px`,
              "--spin": `${c.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
