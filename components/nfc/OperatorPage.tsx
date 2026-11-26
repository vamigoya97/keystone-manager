"use client";

import { usePrivy } from "@privy-io/react-auth";
import { signIn } from "@/lib/signIn";
import { groupOperators, useKeystones } from "./member";
import { PlateHome } from "./plate";

/** Only currently usable keystones from the chosen operator. */
export default function OperatorPage({ operatorId }: { operatorId: string }) {
  const { ready, authenticated, login } = usePrivy();
  const { keystones, error } = useKeystones();
  const groups = groupOperators(keystones ?? []).filter((g) => g.active.length > 0);
  const group = groups.find((g) => g.operator.id === operatorId);
  return <PlateHome state={!ready || (authenticated && keystones === null && !error) ? "loading" : authenticated ? "ready" : "signed-out"} keystones={(group?.active ?? []).sort((a,b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""))} error={authenticated ? error : null} onSignIn={() => signIn(login, "member")} background={group?.operator.appearance?.background} backHref={groups.length > 1 ? "/operators" : undefined} />;
}
