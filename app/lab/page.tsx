import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  formatDates,
  keystonePhase,
  toPublic,
  type GalleryItem,
} from "@/lib/keystones";
import { listKeystones } from "@/lib/store";
import { resolveGallery } from "@/lib/pinata/private";
import LabView from "@/components/lab/LabView";
import type { MemberKeystone } from "@/components/nfc/member";

export const metadata: Metadata = { title: "Lab" };
export const dynamic = "force-dynamic";

/** One second of silent 8 kHz WAV, so the sample audio note plays without a file. */
const SILENCE = (() => {
  const n = 8000;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(n, 24);
  b.writeUInt32LE(n, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return `data:audio/wav;base64,${b.toString("base64")}`;
})();

/**
 * Design lab (development only): every member screen and state side by side,
 * rendered by the real components with a real keystone and sample data, so
 * designs can be tried without chips, sign-in or a wallet.
 */
export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const keystones = await listKeystones();
  if (!keystones.length) notFound();
  const { k } = await searchParams;
  const current =
    keystones.find((x) => x.slug === k) ??
    keystones.find((x) => x.gallery.length) ??
    keystones[0];

  // The vault: the keystone's real items (signed for viewing), plus one of each
  // kind it doesn't have yet so every tile shows.
  let gallery: GalleryItem[] = [];
  try {
    gallery = await resolveGallery(current.gallery);
  } catch {
    gallery = current.gallery.filter((g) => !g.private);
  }
  const has = (kind: string) =>
    gallery.some((g) => (g.kind ?? "image") === kind);
  const samples: GalleryItem[] = [];
  if (!has("image") && current.tokenImage)
    samples.push({
      src: current.tokenImage,
      alt: "Sample photo",
      width: 4,
      height: 5,
    });
  // Any public looping artwork in the store stands in for a clip.
  const clip = keystones.find((x) => x.tokenVideo)?.tokenVideo;
  if (!has("video") && clip)
    samples.push({
      kind: "video",
      src: clip,
      alt: "Sample clip",
      width: 9,
      height: 16,
      duration: 12,
    });
  if (!has("audio"))
    samples.push({
      kind: "audio",
      src: SILENCE,
      alt: "A note from the night",
      width: 1,
      height: 1,
      duration: 84,
      wide: true,
    });
  if (!has("qr"))
    samples.push({
      kind: "qr",
      src: "qr:sample",
      url: "https://example.com",
      alt: "Night two, early entry",
      text: "Show this at the door before 9 pm. One scan per member.",
      width: 1,
      height: 1,
    });
  // A vault the operator has arranged is shown as arranged, with the samples after it.
  // Otherwise show one landscape photo at full width and mix the samples in, as an operator might.
  const arranged = gallery.some((g) => g.sameRow !== undefined);
  const landscape = gallery.findIndex((g) => (g.kind ?? "image") === "image" && g.width > g.height);
  if (!arranged && landscape >= 0) gallery[landscape] = { ...gallery[landscape], wide: true };
  const items = (arranged ? [...gallery, ...samples] : [
    ...gallery.slice(0, 3),
    ...samples,
    ...gallery.slice(3, 12),
  ]).map((g, i) => ({ ...g, key: g.key ?? `${g.src}#${i}` }));

  // The member home: every keystone in the store as if this member held it.
  const held: MemberKeystone[] = keystones.map((x, i) => ({
    slug: x.slug,
    name: x.name,
    operator: null,
    startDate: x.startDate ?? null,
    endDate: x.endDate ?? null,
    dateLabel: formatDates(x) ?? null,
    phase: keystonePhase(x),
    location: x.location ?? null,
    palette: x.palette,
    tokenImage: x.tokenImage,
    symbol: x.token.symbol,
    claimedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    status: "active",
    photos: x.gallery.length,
  }));

  return (
    <LabView
        keystone={toPublic(current)}
        options={keystones.map((x) => ({ slug: x.slug, name: x.name }))}
        items={items}
        held={held}
      />
  );
}
