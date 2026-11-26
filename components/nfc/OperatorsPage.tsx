"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import type { ThemeMedia } from "@/lib/keystones";
import { signIn } from "@/lib/signIn";
import { groupOperators, useKeystones, type MemberKeystone } from "./member";
import { ON_DARK, PLATE } from "./plate";
import { MediaView } from "./themed";
import MemberBackground from "./MemberBackground";

export default function OperatorsPage({ background, selected }: { background?: ThemeMedia; selected?: string }) {
  const { ready, authenticated, login } = usePrivy();
  const { keystones, error } = useKeystones();
  return <OperatorsView background={background} selected={selected} keystones={keystones ?? []} state={!ready || (authenticated && keystones === null && !error) ? "loading" : authenticated ? "ready" : "signed-out"} error={error} onSignIn={() => signIn(login, "member")} />;
}

/**
 * Same view in the member site and the development lab. No public operator directory.
 * One operator at a time, large, over its own background; the row below switches.
 */
export function OperatorsView({ keystones, background, selected, state, error, onSignIn, contained = false }: { keystones: MemberKeystone[]; background?: ThemeMedia; /** Operator id to open on, e.g. when coming back from its page. */ selected?: string; state: "ready" | "loading" | "signed-out"; error?: string | null; onSignIn?: () => void; contained?: boolean }) {
  const groups = groupOperators(keystones).filter((g) => g.active.length > 0);
  // Kept as an id, not an index: keystones load after the first render.
  const [pickedId, setPickedId] = useState(selected);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = groups.find((g) => g.operator.id === pickedId) ?? groups[0];
  const ready = state === "ready" && !error && groups.length > 0;
  const media = (ready ? current?.operator.appearance?.background : undefined) ?? background;

  function pick(i: number) {
    const next = (i + groups.length) % groups.length;
    setPickedId(groups[next].operator.id);
    tabs.current[next]?.focus();
  }

  return (
    <div className={`relative isolate flex ${contained ? "min-h-full" : "min-h-[100dvh]"} flex-col bg-[var(--p-page)] text-[var(--p-ink)] [font-family:var(--font-plate),system-ui,sans-serif]`} style={{ ...PLATE, ...ON_DARK, "--p-page": "#0E0E0E" } as React.CSSProperties}>
      <MemberBackground key={media?.src} media={media} />
      {media && <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#0E0E0E]/40 via-transparent to-[#0E0E0E]/90" />}
      <h1 className="sr-only">Operators</h1>
      {!ready ? (
        <div className="mx-auto w-full max-w-3xl px-5 pt-[max(24px,calc(env(safe-area-inset-top)+12px))]">
          {state === "signed-out" ? <button className="mt-8 border border-current px-5 py-3" onClick={onSignIn}>Sign in</button> : error ? <p role="alert" className="mt-8">{error}</p> : state === "loading" ? <p role="status" className="mt-8">Loading operators…</p> : <p className="mt-8 text-[15px]">Secure a keystone to see its operator here.</p>}
        </div>
      ) : (
        <>
          <div id="operator-focus" role={groups.length > 1 ? "tabpanel" : undefined} className="flex flex-1 flex-col items-center justify-center gap-6 px-5 pt-[max(40px,calc(env(safe-area-inset-top)+24px))]">
            <Link href={`/o/${encodeURIComponent(current.operator.id)}`} aria-label={`${current.operator.name}, ${current.active.length} keystone${current.active.length === 1 ? "" : "s"}`} className="group block rounded-full text-inherit hover:no-underline focus-visible:outline-offset-4">
              <span className="flex aspect-square w-[min(232px,60vw)] items-center justify-center overflow-hidden rounded-full border border-current bg-white/5 text-[56px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-[1.02]">
                {current.operator.appearance?.icon ? <MediaView media={current.operator.appearance.icon} className="h-full w-full object-cover" /> : current.operator.name.charAt(0).toUpperCase()}
              </span>
            </Link>
            <Link href={`/o/${encodeURIComponent(current.operator.id)}`} tabIndex={-1} aria-hidden className="flex h-11 items-center gap-2 rounded-full border border-white/50 bg-black/30 px-[18px] text-[14px] font-medium text-inherit hover:no-underline">
              Open
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
          {groups.length > 1 && (
            <div role="tablist" aria-label="Operators" className="flex justify-center gap-[18px] px-5 pb-[max(44px,calc(env(safe-area-inset-bottom)+28px))]">
              {groups.map(({ operator }, i) => {
                const selected = operator.id === current.operator.id;
                return (
                  <button
                    key={operator.id}
                    ref={(el) => { tabs.current[i] = el; }}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="operator-focus"
                    aria-label={operator.name}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setPickedId(operator.id)}
                    onKeyDown={(e) => { if (e.key === "ArrowRight") pick(i + 1); else if (e.key === "ArrowLeft") pick(i - 1); }}
                    className={`grid size-16 place-items-center rounded-full border-2 transition-opacity ${selected ? "border-current opacity-100" : "border-transparent opacity-60 hover:opacity-90"}`}
                  >
                    <span className="flex size-[54px] items-center justify-center overflow-hidden rounded-full bg-white/10 text-[20px]">
                      {operator.appearance?.icon ? <MediaView media={operator.appearance.icon} className="h-full w-full object-cover" /> : operator.name.charAt(0).toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
