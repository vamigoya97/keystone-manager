/* eslint-disable @next/next/no-img-element */
import type { Keystone } from "@/lib/keystones";
import { NfcGlyph } from "./ClaimShell";

/**
 * The keystone's face: the uploaded artwork exactly as it is (its own shape,
 * square corners, no overlays), playing silently on loop when it's a video.
 * Without artwork, a plain placeholder in the keystone's colors.
 */
export default function TokenCard({ keystone }: { keystone: Omit<Keystone, "gallery"> }) {
  if (keystone.tokenVideo) {
    return (
      <video
        src={keystone.tokenVideo}
        poster={keystone.tokenImage}
        autoPlay
        muted
        loop
        playsInline
        aria-label={`${keystone.name} keystone`}
        className="pointer-events-none block h-auto w-full"
      />
    );
  }
  if (keystone.tokenImage) {
    return <img src={keystone.tokenImage} alt={`${keystone.name} keystone`} draggable={false} className="block h-auto w-full" />;
  }
  const [a, b] = keystone.palette;
  return (
    <div
      aria-label={`${keystone.name} keystone`}
      className="relative flex aspect-[4/5] w-full items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      <span className="flex h-28 w-28 items-center justify-center rounded-full border border-white/30 bg-black/25">
        <NfcGlyph className="h-12 w-12 text-white/90" />
      </span>
    </div>
  );
}
