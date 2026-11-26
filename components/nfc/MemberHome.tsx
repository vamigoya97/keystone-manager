"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { signIn } from "@/lib/signIn";
import { groupOperators, usable, useKeystones } from "./member";
import { PlateHome } from "./plate";

/** Multiple issuers open the operator picker; one issuer opens its artwork list. */
export default function MemberHome() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  const { keystones, error } = useKeystones();
  const held = (keystones ?? []).filter(usable).sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));
  const groups = groupOperators(held);
  const multiple = authenticated && groups.length > 1;
  useEffect(() => { if (multiple) router.replace("/operators"); }, [multiple, router]);
  const operator = groups.length === 1 ? groups[0].operator : undefined;
  return <PlateHome state={!ready || multiple || (authenticated && keystones === null && !error) ? "loading" : authenticated ? "ready" : "signed-out"} keystones={held} error={authenticated ? error : null} onSignIn={() => signIn(login, "member")} background={operator?.appearance?.background} />;
}
