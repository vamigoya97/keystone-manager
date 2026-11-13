"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { signIn } from "@/lib/signIn";
import { useAuthedFetch } from "@/lib/useAccess";
import ClaimShell, { NfcGlyph } from "./ClaimShell";
import { usable, useKeystones } from "./member";

type TapParams = { c?: string; s?: string; picc_data?: string; cmac?: string };
type ItemToken = {
  slug: string;
  name: string;
  dateLabel: string | null;
  location: string | null;
  palette: [string, string];
  tokenImage: string | null;
  symbol: string;
};
type TapResult = { ok: true; operator: { id: string; name: string } | null; tokens: ItemToken[] } | { ok: false; error: string };
type RowState = "idle" | "held" | "claiming" | "claimed" | "error";

const HANDOFF_MS = 900;

/** One verification per tap URL — secure (NTAG 424) taps are single-use. */
const inflight = new Map<string, Promise<TapResult>>();
function submitItemTap(batch: string, tap: TapParams): Promise<TapResult> {
  const key = JSON.stringify([batch, tap]);
  let p = inflight.get(key);
  if (!p) {
    p = fetch("/api/items/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch, ...tap }),
    })
      .then(async (res) => {
        const data = await res.json();
        return res.ok ? { ok: true as const, ...data } : { ok: false as const, error: data.error ?? "Keystone couldn't be aligned" };
      })
      .catch(() => ({ ok: false as const, error: "Network error — try tapping again." }));
    inflight.set(key, p);
  }
  return p;
}

/**
 * A tap on an item that unlocks several tokens (all from one operator).
 * One token → straight to it. Several → claim them all in one step, then
 * land in the first token's gallery; the gallery lists the rest.
 */
export default function ItemLanding({ batch, tap }: { batch: string; tap: TapParams }) {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const authedFetch = useAuthedFetch();
  const { keystones: held } = useKeystones();
  const [result, setResult] = useState<TapResult | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [claiming, setClaiming] = useState(false);
  const claimAfterLogin = useRef(false);

  useEffect(() => {
    submitItemTap(batch, tap).then(setResult);
    // tap is rebuilt each render; its fields are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, tap.c, tap.s, tap.picc_data, tap.cmac]);

  const tokens = result?.ok ? result.tokens : [];

  // Single-token items behave exactly like a token chip.
  useEffect(() => {
    if (result?.ok && tokens.length === 1) router.replace(`/x/${tokens[0].slug}`);
  }, [result, tokens, router]);

  // Mark keystones the member already holds.
  useEffect(() => {
    if (!held || tokens.length < 2) return;
    setRows((r) => {
      const next = { ...r };
      for (const t of tokens) if (!next[t.slug] && held.some((k) => k.slug === t.slug && usable(k))) next[t.slug] = "held";
      return next;
    });
  }, [held, tokens]);

  const remaining = tokens.filter((t) => rows[t.slug] !== "held" && rows[t.slug] !== "claimed");
  const done = tokens.length > 1 && remaining.length === 0;

  // Everything held (already, or just claimed) → into the first token's gated content.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.replace(`/x/${tokens[0].slug}/gallery`), HANDOFF_MS);
    return () => clearTimeout(t);
  }, [done, tokens, router]);

  async function claimAll() {
    setClaiming(true);
    for (const t of remaining) {
      setRows((r) => ({ ...r, [t.slug]: "claiming" }));
      try {
        const res = await authedFetch(`/api/k/${t.slug}/mint`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't secure");
        setRows((r) => ({ ...r, [t.slug]: "claimed" }));
      } catch (e: any) {
        setRows((r) => ({ ...r, [t.slug]: "error" }));
        setErrors((x) => ({ ...x, [t.slug]: e.message }));
      }
    }
    setClaiming(false);
  }

  // Resume after Privy sign-in.
  useEffect(() => {
    if (claimAfterLogin.current && authenticated && held) {
      claimAfterLogin.current = false;
      claimAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, held]);

  const palette = tokens[0]?.palette ?? (["#C8FF2E", "#2EE6FF"] as [string, string]);

  // ── Verifying / failed ──
  if (!result || (result.ok && tokens.length === 1)) {
    return (
      <ClaimShell keystone={{ palette }}>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative mb-10 flex h-28 w-28 items-center justify-center">
            <span className="tap-ring" />
            <span className="tap-ring" />
            <span className="tap-ring" />
            <div className="glass-elevated relative flex h-28 w-28 items-center justify-center rounded-full text-accent">
              <NfcGlyph className="h-11 w-11" />
            </div>
          </div>
          <p className="text-sm text-text-secondary">{result ? "Keystone aligned. Opening your access…" : "Aligning keystone…"}</p>
        </div>
      </ClaimShell>
    );
  }

  if (!result.ok) {
    return (
      <ClaimShell keystone={{ palette }}>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-10 flex h-28 w-28 items-center justify-center rounded-full border border-rose/40 bg-rose-dim text-rose">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" aria-hidden>
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm text-rose">{result.error}</p>
          <p className="mt-2 text-xs text-text-muted">Hold your phone to the item again to retry.</p>
        </div>
      </ClaimShell>
    );
  }

  // ── Several keystones ──
  const label = remaining.length === tokens.length ? `Secure ${tokens.length} keystones` : `Secure ${remaining.length} remaining`;
  return (
    <ClaimShell keystone={{ palette }}>
      <header className="rise flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.3em] text-text-secondary">{result.operator?.name ?? "Your item"}</span>
        <span className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-dim px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-accent">
          <NfcGlyph className="h-3 w-3" /> Keystone aligned
        </span>
      </header>

      <section className="rise mt-8" style={{ animationDelay: "80ms" }}>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">This item unlocks {tokens.length} keystones</h1>
        <p className="mt-1 text-sm text-text-secondary">One tap secures them all — free, network fees covered.</p>
      </section>

      <ul className="rise mt-6 space-y-2.5" style={{ animationDelay: "160ms" }}>
        {tokens.map((t) => {
          const state = rows[t.slug] ?? "idle";
          return (
            <li key={t.slug} className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-3">
              <span
                className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10"
                style={{ background: `linear-gradient(135deg, ${t.palette[0]}, ${t.palette[1]})` }}
              >
                {t.tokenImage && <img src={t.tokenImage} alt="" className="h-full w-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{t.name}</span>
                <span className="block truncate text-[12px] text-text-secondary">
                  {state === "error" ? <span className="text-rose">{errors[t.slug]}</span> : [t.dateLabel, t.location].filter(Boolean).join(" · ") || `$${t.symbol}`}
                </span>
              </span>
              <span className="shrink-0 text-[12px]">
                {state === "held" || state === "claimed" ? (
                  <span className="text-accent">{state === "held" ? "Yours" : "Secured ✓"}</span>
                ) : state === "claiming" ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                ) : state === "error" ? (
                  <span className="text-rose">Failed</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex-1" />

      <div className="rise mt-8" style={{ animationDelay: "240ms" }}>
        {done ? (
          <p className="text-center text-sm text-accent">All yours — opening {tokens[0].name}…</p>
        ) : (
          <button
            disabled={!ready || claiming}
            onClick={() => {
              if (!authenticated) {
                claimAfterLogin.current = true;
                signIn(login, "member");
              } else claimAll();
            }}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-semibold tracking-wide text-surface transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-80"
          >
            {claiming && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {claiming ? "Securing…" : authenticated ? label : `Sign in to ${label.toLowerCase()}`}
          </button>
        )}
      </div>
    </ClaimShell>
  );
}
