"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { signIn } from "@/lib/signIn";
import type { KeystonePhase } from "@/lib/keystones";
import { useAuthedFetch } from "@/lib/useAccess";
import { PLATE } from "./plate";

/**
 * Member area: the home overview (/), operators (/operators) and one
 * operator's page (/o/<id>) share this data hook, shell and rows.
 */

export type KeystoneStatus = "active" | "received" | "not-held" | "revoked" | "unknown";

export type MemberKeystone = {
  slug: string;
  name: string;
  /** The creator, community or brand that issued the keystone. */
  operator: { id: string; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  dateLabel: string | null;
  phase: KeystonePhase | null;
  location: string | null;
  palette: [string, string];
  tokenImage?: string;
  symbol: string;
  claimedAt: string | null;
  /** Decided server-side from current on-chain holdings + claim records. */
  status: KeystoneStatus;
  photos: number;
};

/** Keystones the member can currently use (held, or the chain couldn't be reached). */
export const usable = (k: MemberKeystone) => k.status === "active" || k.status === "received" || k.status === "unknown";

export function useKeystones() {
  const { ready, authenticated } = usePrivy();
  const authedFetch = useAuthedFetch();
  const [keystones, setKeystones] = useState<MemberKeystone[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    authedFetch("/api/me/keystones")
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error);
        setKeystones(data.keystones);
      })
      .catch((e) => !cancelled && setError(e.message || "Couldn't load your keystones"));
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, authedFetch]);

  return { keystones, error };
}

/**
 * Keystones by time: live and upcoming (soonest first), ongoing (no dates,
 * newest claim first), then past (most recent first).
 */
export function groupByTime(keystones: MemberKeystone[]) {
  const soon = keystones
    .filter((k) => k.phase === "upcoming" || k.phase === "live")
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const ongoing = keystones
    .filter((k) => !k.phase)
    .sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));
  const past = keystones
    .filter((k) => k.phase === "past")
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  return { soon, ongoing, past, all: [...soon, ...ongoing, ...past] };
}

export type OperatorGroup = {
  operator: { id: string; name: string };
  /** Every keystone from this operator, any status. */
  keystones: MemberKeystone[];
  /** Keystones the member can use right now. */
  active: MemberKeystone[];
  time: ReturnType<typeof groupByTime>;
};

/**
 * Keystones grouped by the operator that issued them. An operator counts once
 * the member has at least one usable keystone from it; operators they only
 * used to hold keystones from come back with active: [].
 */
export function groupOperators(keystones: MemberKeystone[]): OperatorGroup[] {
  const groups = new Map<string, MemberKeystone[]>();
  for (const k of keystones) {
    if (!k.operator) continue;
    groups.set(k.operator.id, [...(groups.get(k.operator.id) ?? []), k]);
  }
  return [...groups.values()]
    .map((list) => ({ operator: list[0].operator!, keystones: list, active: list.filter(usable), time: groupByTime(list) }))
    .sort((a, b) => b.active.length - a.active.length || a.operator.name.localeCompare(b.operator.name));
}

/** Plate surfaces, the same as the member home (components/nfc/plate.tsx). */
const page = "bg-[var(--p-page)] text-[var(--p-ink)] [font-family:var(--font-plate),system-ui,sans-serif] antialiased";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/operators", label: "Operators" },
];

/** Frame for the member area pages: header, tabs, and the signed-out/loading states. */
export function MemberShell({
  title,
  nav = true,
  children,
}: {
  title: string;
  /** Show the Home / Operators tabs. */
  nav?: boolean;
  children: (ctx: { who?: string }) => React.ReactNode;
}) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const pathname = usePathname();
  const who = user?.phone?.number || user?.email?.address;

  return (
    <div className={`flex min-h-[100dvh] flex-col ${page}`} style={PLATE}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <header className="flex items-baseline justify-between px-5 pb-4 pt-[max(20px,calc(env(safe-area-inset-top)+12px))]">
          <span className="text-[17px] font-semibold tracking-[-0.01em]">{title}</span>
          {authenticated && (
            <button onClick={() => logout()} className="text-[13px] text-[var(--p-slate)] underline-offset-4 hover:underline">
              Sign out
            </button>
          )}
        </header>

        {!ready ? (
          <div className="flex flex-1 items-center justify-center" role="status">
            <PlateSpinner />
            <span className="sr-only">Loading</span>
          </div>
        ) : !authenticated ? (
          <SignedOut onSignIn={() => signIn(login, "member")} />
        ) : (
          <>
            {nav && (
              <nav aria-label="Your keystones" className="flex gap-6 border-b border-[var(--p-rule)] px-5">
                {TABS.map((t) => {
                  const active =
                    t.href === "/" ? pathname === "/" : pathname.startsWith(t.href) || (t.href === "/operators" && pathname.startsWith("/o/"));
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      aria-current={active ? "page" : undefined}
                      className={`-mb-px border-b py-3 text-[15px] hover:no-underline ${
                        active ? "border-[var(--p-ink)] font-medium text-[var(--p-ink)]" : "border-transparent text-[var(--p-slate)] hover:text-[var(--p-ink)]"
                      }`}
                    >
                      {t.label}
                    </Link>
                  );
                })}
              </nav>
            )}
            {children({ who })}
          </>
        )}
      </div>
    </div>
  );
}

/** The Plate spinner: a thin slate ring, like the slide button's knob while it works. */
export function PlateSpinner({ className = "h-5 w-5" }: { className?: string }) {
  return <span aria-hidden className={`${className} animate-spin rounded-full border-[1.8px] border-[var(--p-slate)] border-t-transparent`} />;
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="mt-auto px-5 pb-[max(40px,calc(env(safe-area-inset-bottom)+24px))]">
      <p className="mb-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em]">Hold your phone to your item.</p>
      <p className="mb-8 max-w-[34ch] text-[15px] leading-[1.6] text-[var(--p-slate)]">
        That secures its keystone. If you already hold one, sign in to see it.
      </p>
      <button
        onClick={onSignIn}
        className="h-12 w-full rounded-md bg-[var(--p-ink)] text-[15px] font-medium text-[var(--p-on-ink)] focus-visible:outline-offset-2 active:opacity-85"
      >
        Sign in
      </button>
    </div>
  );
}

/** Page title for a member section. */
export function PageTitle({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-5">
      <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em]">{title}</h1>
      {body && <p className="mt-2 text-[15px] leading-[1.6] text-[var(--p-slate)]">{body}</p>}
    </div>
  );
}

export function SectionHeader({ title, count, href }: { title: string; count?: number; href?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-5">
      <h2 className="text-[13px] font-medium text-[var(--p-slate)]">
        {title}
        {count !== undefined && <span className="ml-2 tabular-nums">{count}</span>}
      </h2>
      {href && (
        <Link href={href} className="text-[13px] text-[var(--p-ink)] underline-offset-4 hover:underline">
          See all
        </Link>
      )}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 pt-8">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 text-[15px] leading-[1.6] text-[var(--p-slate)]">{body}</p>
    </div>
  );
}

/** Loading rows: flat raised tiles in the shape of the rows to come, no shimmer. */
export function LoadingRows({ count = 2 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-[2px]" aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[80px] bg-[var(--p-raised)]" />
      ))}
    </div>
  );
}

function StatusLabel({ status }: { status: KeystoneStatus }) {
  if (status === "revoked") return <span className="shrink-0 text-[13px] text-[var(--p-alert)]">Revoked</span>;
  if (status === "not-held") return <span className="shrink-0 text-[13px] text-[var(--p-slate)]">No longer held</span>;
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--p-slate)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function PhaseTag({ phase }: { phase: KeystonePhase | null }) {
  if (phase === "live") return <span className="shrink-0 rounded-sm bg-[var(--p-ink)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--p-on-ink)]">Live</span>;
  if (phase === "upcoming") return <span className="shrink-0 rounded-sm border border-[var(--p-rule)] px-1.5 py-0.5 text-[11px] text-[var(--p-slate)]">Upcoming</span>;
  return null;
}

/** Default detail line: dates and place when set, otherwise the token and photo count. */
function defaultDetail(k: MemberKeystone, showOperator: boolean): string {
  const when = [k.dateLabel, k.location].filter(Boolean);
  const what = when.length ? when : [`$${k.symbol}`, k.photos > 0 ? `${k.photos} in the vault` : null];
  return [...what, showOperator && k.operator ? `by ${k.operator.name}` : null].filter(Boolean).join(" · ");
}

/** One keystone: art, name, details line and where tapping it goes. */
export function KeystoneRow({
  keystone: k,
  detail,
  showOperator = false,
  compact = false,
}: {
  keystone: MemberKeystone;
  detail?: string;
  showOperator?: boolean;
  compact?: boolean;
}) {
  const [a, b] = k.palette;
  const { status } = k;
  const canOpen = usable(k);
  const line = status === "not-held" ? "This keystone has moved to another wallet" : detail ?? defaultDetail(k, showOperator);

  const body = (
    <>
      <div className={`${compact ? "h-10 w-10" : "h-14 w-14"} shrink-0 overflow-hidden`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
        {k.tokenImage && <img src={k.tokenImage} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate font-semibold ${compact ? "text-[14px]" : "text-[15px]"}`}>{k.name}</span>
          <PhaseTag phase={k.phase} />
          {status === "received" && (
            <span className="shrink-0 rounded-sm border border-[var(--p-rule)] px-1.5 py-0.5 text-[11px] text-[var(--p-slate)]">Received</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-[var(--p-slate)]">{line}</div>
      </div>
      <StatusLabel status={status} />
    </>
  );

  const cls = `flex items-center gap-4 bg-[var(--p-raised)] px-5 ${compact ? "py-2.5" : "py-3"}`;
  if (status === "revoked") return <div className={`${cls} opacity-60`}>{body}</div>;
  return (
    <Link
      // Keystones they no longer hold go to the claim page rather than a gallery that would bounce them.
      href={canOpen ? `/x/${k.slug}/gallery` : `/x/${k.slug}`}
      className={`${cls} text-[var(--p-ink)] hover:no-underline focus-visible:outline-offset-[-2px] ${canOpen ? "" : "opacity-70"}`}
    >
      {body}
    </Link>
  );
}

/** One operator the member holds keystones from, linking to its page. */
export function OperatorCard({ group }: { group: OperatorGroup }) {
  const lead = group.active[0] ?? group.keystones[0];
  const [a, b] = lead.palette;
  const n = group.active.length;
  const upcoming = group.time.soon.find(usable);
  const names = group.keystones.slice(0, 4).map((k) => k.name);
  const more = group.keystones.length - names.length;

  return (
    <Link
      href={`/o/${group.operator.id}`}
      className={`flex items-center gap-4 bg-[var(--p-raised)] px-5 py-4 text-[var(--p-ink)] hover:no-underline focus-visible:outline-offset-[-2px] ${n ? "" : "opacity-60"}`}
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center text-[20px] font-semibold text-white"
        style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
      >
        {group.operator.name.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase() || "•"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{group.operator.name}</span>
        <span className="block truncate text-[13px] text-[var(--p-slate)]">
          {n ? `${n} keystone${n === 1 ? "" : "s"}` : "No keystones held"}
          {upcoming ? ` · Next: ${upcoming.dateLabel ?? upcoming.name}` : ""}
        </span>
        <span className="mt-1 block truncate text-[13px] text-[var(--p-slate)]">
          {names.join(" · ")}
          {more > 0 ? ` · +${more}` : ""}
        </span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--p-slate)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
