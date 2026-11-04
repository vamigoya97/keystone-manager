import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { toPublic } from "@/lib/keystones";
import { getKeystone } from "@/lib/store";
import TokenClaim from "@/components/nfc/TokenClaim";

export const metadata: Metadata = { title: "Secure keystone" };

/**
 * Link an NFC chip opens:
 *   static   /x/<slug>/tap?c=<chipId>&s=<sig>
 *   ntag424  /x/<slug>/tap?picc_data=<enc>&cmac=<mac>
 * It renders the claim page directly (the URL becomes /x/<slug>); the chip is
 * verified in the background and the mint button appears once it passes.
 * Chips programmed before a rename open the old slug and are redirected here
 * with their query intact; they still verify against the token's chip scope.
 */
export default async function TapPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string; s?: string; picc_data?: string; cmac?: string }>;
}) {
  const { slug } = await params;
  const { c, s, picc_data, cmac } = await searchParams;
  const keystone = await getKeystone(slug);
  if (!keystone) notFound();
  if (keystone.slug !== slug) {
    const query = new URLSearchParams(
      Object.entries({ c, s, picc_data, cmac }).filter((kv): kv is [string, string] => typeof kv[1] === "string")
    ).toString();
    redirect(`/x/${keystone.slug}/tap${query ? `?${query}` : ""}`);
  }

  return <TokenClaim keystone={toPublic(keystone)} source={null} tap={{ c, s, picc_data, cmac }} />;
}
