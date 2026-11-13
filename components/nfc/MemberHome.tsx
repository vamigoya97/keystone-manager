"use client";

import { usePrivy } from "@privy-io/react-auth";
import { signIn } from "@/lib/signIn";
import { usable, useKeystones } from "./member";
import { PlateHome } from "./plate";

/** Member home: the keystones you've claimed, as a two-column grid of their artwork. */
export default function MemberHome() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { keystones, error } = useKeystones();
  const held = (keystones ?? []).filter(usable).sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));

  return (
    <PlateHome
      state={!ready || (authenticated && keystones === null && !error) ? "loading" : !authenticated ? "signed-out" : "ready"}
      keystones={held}
      error={authenticated ? error : null}
      onSignIn={() => signIn(login, "member")}
      onSignOut={() => logout()}
    />
  );
}
