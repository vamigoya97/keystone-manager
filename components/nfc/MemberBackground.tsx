"use client";

/* eslint-disable @next/next/no-img-element */

import { useReducedMotion } from "motion/react";
import type { ThemeMedia } from "@/lib/keystones";
import { mediaUrl } from "@/lib/theme";

/** Decorative background stays separate from private vault media. */
export default function MemberBackground({ media }: { media?: ThemeMedia }) {
  const reduceMotion = useReducedMotion();
  if (!media) return null;
  const src = mediaUrl(media.src);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {media.kind === "video" ? <video key={`${src}-${reduceMotion}`} src={src} autoPlay={!reduceMotion} muted loop playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={src} alt="" className="h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-black/45" />
    </div>
  );
}
