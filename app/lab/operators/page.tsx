import { notFound } from "next/navigation";
import Link from "next/link";
import { listKeystones, listOperators } from "@/lib/store";
import { formatDates, keystonePhase, type ThemeMedia } from "@/lib/keystones";
import type { MemberKeystone } from "@/components/nfc/member";
import { OperatorsView } from "@/components/nfc/OperatorsPage";
import { PlateHome } from "@/components/nfc/plate";

export const dynamic = "force-dynamic";
/** Development-only sample holdings: never bypasses member auth on real routes. */
export default async function Page({ searchParams }: { searchParams: Promise<{ media?: string; op?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const [sourceOperators, keystones] = await Promise.all([listOperators(), listKeystones()]);
  const { media, op } = await searchParams;
  const sampleMedia = media === "1";
  const operators = sourceOperators.map((op) => {
    if (!sampleMedia) return op;
    const art = keystones.find((k) => k.operatorId === op.id && k.tokenImage);
    const icon: ThemeMedia | undefined = art?.tokenImage ? { src: art.tokenImage, kind: "image" } : undefined;
    const background: ThemeMedia | undefined = art?.tokenVideo ? { src: art.tokenVideo, kind: "video" } : icon;
    return { ...op, appearance: { icon: op.appearance?.icon ?? icon, background: op.appearance?.background ?? background } };
  });
  const held: MemberKeystone[] = keystones.map((k) => {
    const operator = operators.find((o) => o.id === k.operatorId);
    return { slug: k.slug, name: k.name, operator: operator ? { id: operator.id, name: operator.name, appearance: operator.appearance } : null, status: "active", startDate: k.startDate ?? null, endDate: k.endDate ?? null, dateLabel: formatDates(k) ?? null, phase: keystonePhase(k), location: k.location ?? null, palette: k.palette, tokenImage: k.tokenImage, symbol: k.token.symbol, claimedAt: null, photos: k.gallery.length };
  });
  return <div className="min-h-screen bg-surface p-6"><h1 className="mb-2 text-xl">Operator navigation · sample holdings</h1><p className="mb-6 text-sm text-text-secondary">{sampleMedia ? "Sample artwork as icons and backgrounds; nothing is saved. " : "Development preview. "}<Link href={sampleMedia ? "/lab/operators" : "/lab/operators?media=1"} className="underline">{sampleMedia ? "Saved appearance" : "Preview sample media"}</Link> · <Link href="/lab/console" className="underline">Operator console</Link></p><div className="grid gap-6 lg:grid-cols-2"><div className="h-[760px] overflow-auto border border-border-default"><OperatorsView keystones={held} selected={op} state="ready" background={sampleMedia ? operators[0]?.appearance?.background : undefined} contained /></div>{operators.map((operator) => <div key={operator.id} className="h-[760px] overflow-auto border border-border-default"><PlateHome state="ready" keystones={held.filter((k) => k.operator?.id === operator.id)} background={operator.appearance?.background} backHref={`/operators?op=${encodeURIComponent(operator.id)}`} contained /></div>)}</div></div>;
}
