import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { toPublic } from "@/lib/keystones";
import { getKeystone } from "@/lib/store";
import Gallery from "@/components/nfc/Gallery";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const keystone = await getKeystone((await params).slug);
  return { title: keystone ? `${keystone.name} · Gallery` : "Not found" };
}

/** Holder-only photo gallery. */
export default async function GalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const keystone = await getKeystone(slug);
  if (!keystone) notFound();
  if (keystone.slug !== slug) redirect(`/x/${keystone.slug}/gallery`);

  return <Gallery keystone={toPublic(keystone)} />;
}
