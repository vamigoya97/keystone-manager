"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import type { ThemeMedia } from "@/lib/keystones";
import { signIn } from "@/lib/signIn";
import { groupOperators, useKeystones, type MemberKeystone } from "./member";
import { PLATE } from "./plate";
import { MediaView } from "./themed";
import MemberBackground from "./MemberBackground";

export default function OperatorsPage({ background }: { background?: ThemeMedia }) {
  const { ready, authenticated, login } = usePrivy();
  const { keystones, error } = useKeystones();
  return <OperatorsView background={background} keystones={keystones ?? []} state={!ready || (authenticated && keystones === null && !error) ? "loading" : authenticated ? "ready" : "signed-out"} error={error} onSignIn={() => signIn(login, "member")} />;
}

/** Same view in the member site and the development lab. No public operator directory. */
export function OperatorsView({ keystones, background, state, error, onSignIn, contained = false }: { keystones: MemberKeystone[]; background?: ThemeMedia; state: "ready" | "loading" | "signed-out"; error?: string | null; onSignIn?: () => void; contained?: boolean }) {
  const groups = groupOperators(keystones).filter((g) => g.active.length > 0);
  return (
    <div className={`relative isolate flex ${contained ? "min-h-full" : "min-h-[100dvh]"} flex-col bg-[var(--p-page)] text-[var(--p-ink)] [font-family:var(--font-plate),system-ui,sans-serif]`} style={{ ...PLATE, ...(background ? { "--p-ink": "#f2f2f0", "--p-slate": "#f2f2f0" } : {}) }}>
      <MemberBackground media={background} />
      <div className="mx-auto w-full max-w-3xl px-5 pb-[max(40px,env(safe-area-inset-bottom))] pt-[max(24px,calc(env(safe-area-inset-top)+12px))]">
        <h1 className="sr-only">Operators</h1>
        {state === "signed-out" ? <button className="mt-8 border border-current px-5 py-3" onClick={onSignIn}>Sign in</button> : error ? <p role="alert" className="mt-8">{error}</p> : state === "loading" ? <p role="status" className="mt-8">Loading operators…</p> : groups.length === 0 ? <p className="mt-8 text-[15px]">Secure a keystone to see its operator here.</p> : (
          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
            {groups.map(({ operator, active }) => (
              <Link key={operator.id} href={`/o/${encodeURIComponent(operator.id)}`} className="group flex min-w-0 flex-col items-center text-center text-inherit hover:no-underline" aria-label={`${operator.name}, ${active.length} keystone${active.length === 1 ? "" : "s"}`}>
                <span className="flex aspect-square w-full max-w-[144px] items-center justify-center overflow-hidden rounded-full border border-current bg-black/10 text-[32px] transition-transform group-hover:scale-[1.03]">
                  {operator.appearance?.icon ? <MediaView media={operator.appearance.icon} className="h-full w-full object-cover" /> : operator.name.charAt(0).toUpperCase()}
                </span>
                <span className="mt-3 max-w-full break-words text-[15px] font-medium">{operator.name}</span>
                <span className="mt-1 text-[12px]">{active.length} keystone{active.length === 1 ? "" : "s"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
