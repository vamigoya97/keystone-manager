import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { keystonePhase } from "@/lib/keystones";
import { passContent } from "@/lib/passMetadata";
import { resolveGallery } from "@/lib/pinata/private";
import { listItemBatches, listKeystones, listMembers, listOperators } from "@/lib/store";
import LabConsole, { type LabConsoleData } from "@/components/lab/LabConsole";

export const metadata: Metadata = { title: "Lab · Operator console" };
export const dynamic = "force-dynamic";

/**
 * Design lab (development only): the real operator console on this machine's
 * operators, keystones, members and vaults, with no sign-in. Saving is off:
 * the console's API calls are answered from this snapshot and changes are refused.
 */
export default async function LabConsolePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const all = await listKeystones();
  const keystones = await Promise.all(
    all.map(async (exp) => {
      const members = await listMembers(exp.slug);
      const gallery = await resolveGallery(exp.gallery).catch(() => exp.gallery.map((g) => ({ ...g, key: g.src })));
      return {
        summary: { ...exp, phase: keystonePhase(exp), memberCount: members.filter((m) => !m.revoked).length },
        detail: {
          keystone: { ...exp, gallery },
          // No chain reads in the lab: the Contract section shows its not-deployed state.
          tokenStats: null,
          members,
          pass: passContent(exp, { baseUrl: "http://localhost:3000" }),
        },
      };
    })
  );

  const data: LabConsoleData = {
    overview: {
      operators: await listOperators(),
      keystones: keystones.map((k) => k.summary),
      itemBatches: await listItemBatches(),
      // A made-up gas wallet so the header menu shows its normal state.
      wallet: {
        address: "0x0000000000000000000000000000000000000000",
        chain: "Base Sepolia",
        balanceEth: "0.0421",
        costPerMintEth: "0.0000052",
        mintsRemaining: 8096,
        explorerUrl: "https://sepolia.basescan.org",
      },
    },
    details: Object.fromEntries(keystones.map((k) => [k.summary.slug, k.detail])),
  };

  return <LabConsole data={data} />;
}
