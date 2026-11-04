import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { toPublic } from "@/lib/keystones";
import { getKeystone } from "@/lib/store";
import { getTapSession } from "@/lib/tap";
import TokenClaim from "@/components/nfc/TokenClaim";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const keystone = await getKeystone((await params).slug);
  return { title: keystone ? keystone.name : "Not found" };
}

/** Keystone page: artwork + forge, reached after a chip tap. */
export default async function TokenPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const keystone = await getKeystone(slug);
  if (!keystone) notFound();
  if (keystone.slug !== slug) redirect(`/x/${keystone.slug}`);

  const session = await getTapSession(keystone);
  const source = session ? "chip" : null;

  return <TokenClaim keystone={toPublic(keystone)} source={source} />;
}
