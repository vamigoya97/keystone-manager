import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getItemBatch } from "@/lib/store";
import ItemLanding from "@/components/nfc/ItemLanding";

export const metadata: Metadata = { title: "Aligning keystone" };

/**
 * Landing page for a physical item that unlocks several tokens:
 *   static   /t/<batch>?c=<chipId>&s=<sig>
 *   ntag424  /t/<batch>?picc_data=<enc>&cmac=<mac>
 */
export default async function ItemTapPage({
  params,
  searchParams,
}: {
  params: Promise<{ batch: string }>;
  searchParams: Promise<{ c?: string; s?: string; picc_data?: string; cmac?: string }>;
}) {
  const { batch } = await params;
  const { c, s, picc_data, cmac } = await searchParams;
  if (!(await getItemBatch(batch))) notFound();
  return <ItemLanding batch={batch} tap={{ c, s, picc_data, cmac }} />;
}
