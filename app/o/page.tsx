import type { Metadata } from "next";
import { sanitizeMedia } from "@/lib/theme";
import OperatorsPage from "@/components/nfc/OperatorsPage";

export const metadata: Metadata = { title: "Your operators" };

export const dynamic = "force-dynamic";

/** The operators that issued the member's keystones. */
export default async function Page({ searchParams }: { searchParams: Promise<{ kop?: string; op?: string }> }) {
  // ?kop=<operator id> opens on that operator; ?op= is the older name, still honoured for old links.
  const { kop, op } = await searchParams;
  // A shared artwork slot, separate from each operator's configurable background.
  const src = process.env.OPERATORS_BACKGROUND_URL;
  const background = src ? sanitizeMedia({ src, kind: process.env.OPERATORS_BACKGROUND_KIND === "video" ? "video" : "image" }) : undefined;
  return <OperatorsPage background={background} selected={kop ?? op} />;
}
