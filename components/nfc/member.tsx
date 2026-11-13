"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { signIn } from "@/lib/signIn";
import type { KeystonePhase } from "@/lib/keystones";
import { useAuthedFetch } from "@/lib/useAccess";
import ClaimShell, { NfcGlyph } from "./ClaimShell";

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

const SHELL = { palette: ["#C8FF2E", "#2EE6FF"] as [string, string] };

const TABS = [
  { href: "/", label: "Home" },
  { href: "/operators", label: "Operators" },
];

/** Frame for every member page: header, tabs, and the signed-out/loading states. */
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
    <ClaimShell keystone={SHELL}>
      <header className="rise flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.3em] text-text-secondary">{title}</span>
        {authenticated && (
          <button
            onClick={() => logout()}
            className="rounded-full px-3 py-1.5 text-[11px] text-text-muted hover:bg-surface-raised hover:text-text-secondary"
          >
            Sign out
          </button>
        )}
      </header>

      {!ready ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : !authenticated ? (
        <SignedOut onSignIn={() => signIn(login, "member")} />
      ) : (
        <>
          {nav && <nav aria-label="Your keystones" className="rise mt-6 flex gap-1 rounded-2xl border border-border-subtle bg-surface-raised p-1">
            {TABS.map((t) => {
              const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href) || (t.href === "/operators" && pathname.startsWith("/o/"));
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex-1 rounded-xl py-2 text-center text-[13px] transition-colors hover:no-underline ${
                    active ? "bg-surface-elevated font-medium text-text-primary" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>}
          {children({ who })}
        </>
      )}
    </ClaimShell>
  );
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="rise relative mb-10 flex h-24 w-24 items-center justify-center">
          <span className="tap-ring" />
          <span className="tap-ring" />
          <div className="glass-elevated relative flex h-24 w-24 items-center justify-center rounded-full text-accent">
            <NfcGlyph className="h-10 w-10" />
          </div>
        </div>
        <h1 className="rise text-[28px] font-semibold leading-tight tracking-tight" style={{ animationDelay: "80ms" }}>
          Tap your item to begin
        </h1>
        <p className="rise mt-3 max-w-xs text-sm leading-relaxed text-text-secondary" style={{ animationDelay: "160ms" }}>
          Hold your phone near the item to secure your free keystone. Already a member? Sign in to see your
          keystones.
        </p>
      </div>
      <button
        onClick={onSignIn}
        className="rise h-14 w-full rounded-2xl bg-accent text-[15px] font-semibold tracking-wide text-surface transition-all hover:brightness-110 active:scale-[0.98]"
        style={{ animationDelay: "240ms" }}
      >
        Sign in
      </button>
    </>
  );
}

export function SectionHeader({ title, count, href }: { title: string; count?: number; href?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
        {title}
        {count !== undefined && <span className="ml-2 font-normal text-text-muted">{count}</span>}
      </h2>
      {href && (
        <Link href={href} className="text-[12px] text-accent hover:no-underline">
          See all →
        </Link>
      )}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-default px-6 py-8 text-center">
      <NfcGlyph className="mx-auto h-7 w-7 text-accent" />
      <p className="mt-3 text-[15px] font-medium">{title}</p>
      <p className="mt-1 text-[13px] text-text-secondary">{body}</p>
    </div>
  );
}

export function LoadingRows({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[84px] animate-pulse rounded-2xl bg-surface-raised" />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: KeystoneStatus }) {
  if (status === "revoked") {
    return <span className="shrink-0 rounded-full bg-rose-dim px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-rose">Revoked</span>;
  }
  if (status === "not-held") {
    return (
      <span className="shrink-0 rounded-full bg-surface-elevated px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">
        No longer held
      </span>
    );
  }
  return <span className="shrink-0 text-[13px] text-accent">Open →</span>;
}

function PhaseTag({ phase }: { phase: KeystonePhase | null }) {
  if (phase === "live") return <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-surface">Live</span>;
  if (phase === "upcoming") return <span className="shrink-0 rounded-full bg-accent-dim px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-accent">Upcoming</span>;
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
      <div
        className={`${compact ? "h-10 w-10 rounded-lg" : "h-14 w-14 rounded-xl"} shrink-0 overflow-hidden border border-white/10`}
        style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
      >
        {k.tokenImage && <img src={k.tokenImage} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate font-semibold ${compact ? "text-[14px]" : "text-[15px]"}`}>{k.name}</span>
          <PhaseTag phase={k.phase} />
          {status === "received" && (
            <span className="shrink-0 rounded-full bg-accent-dim px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-accent">Received</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-text-secondary">{line}</div>
      </div>
      <StatusBadge status={status} />
    </>
  );

  const cls = `flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface-raised ${compact ? "p-2.5" : "p-3.5"}`;
  if (status === "revoked") return <div className={`${cls} opacity-60`}>{body}</div>;
  return (
    <Link
      // Keystones they no longer hold go to the claim page rather than a gallery that would bounce them.
      href={canOpen ? `/x/${k.slug}/gallery` : `/x/${k.slug}`}
      className={`${cls} transition-colors hover:border-accent/40 hover:no-underline ${canOpen ? "" : "opacity-70"}`}
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

  return (
    <Link
      href={`/o/${group.operator.id}`}
      className={`block overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised transition-colors hover:border-accent/40 hover:no-underline ${
        n ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-center gap-4 p-4" style={{ background: `linear-gradient(135deg, ${a}2e, ${b}1f)` }}>
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 text-[20px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
        >
          {group.operator.name.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase() || "•"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold text-text-primary">{group.operator.name}</span>
          <span className="block truncate text-[12px] text-text-secondary">
            {n ? `${n} keystone${n === 1 ? "" : "s"}` : "No keystones held"}
          </span>
        </span>
        <span className="shrink-0 text-[13px] text-accent">→</span>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-border-subtle px-4 py-3">
        {group.keystones.slice(0, 4).map((k) => (
          <span key={k.slug} className="max-w-full truncate rounded-full bg-surface-elevated px-2.5 py-1 text-[11px] text-text-secondary">
            {k.name}
          </span>
        ))}
        {group.keystones.length > 4 && <span className="px-1 py-1 text-[11px] text-text-muted">+{group.keystones.length - 4}</span>}
        {upcoming && (
          <span className="ml-auto rounded-full bg-accent-dim px-2.5 py-1 text-[11px] text-accent">
            Next: {upcoming.dateLabel ?? upcoming.name}
          </span>
        )}
      </div>
    </Link>
  );
}
