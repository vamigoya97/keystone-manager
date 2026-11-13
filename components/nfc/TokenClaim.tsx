"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLogin } from "@privy-io/react-auth";
import { signIn } from "@/lib/signIn";
import type { PublicKeystone } from "@/lib/keystones";
import { useAccess, useAuthedFetch } from "@/lib/useAccess";
import { PlateClaim, type ClaimAccess, type MintPhase } from "./plate";

export type TapParams = { c?: string; s?: string; picc_data?: string; cmac?: string };
type TapResult = { ok: boolean; error: string | null };

/**
 * One request per tap URL. Secure (NTAG 424 DNA) taps are single-use, so a
 * repeated POST — e.g. React re-running the effect in dev — would be
 * rejected as a replay. Everything for the same URL shares one request.
 */
const inflight = new Map<string, Promise<TapResult>>();

function submitTap(slug: string, tap: TapParams): Promise<TapResult> {
  const key = JSON.stringify([slug, tap]);
  let p = inflight.get(key);
  if (!p) {
    p = fetch("/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...tap }),
    })
      .then(async (res) => ({
        ok: res.ok,
        error: res.ok ? null : (((await res.json()) as { error?: string }).error ?? null),
      }))
      .catch(() => ({ ok: false, error: "Network error — try tapping again." }));
    inflight.set(key, p);
  }
  return p;
}

export default function TokenClaim({
  keystone,
  source,
  tap,
}: {
  keystone: PublicKeystone;
  /** Whether an earlier chip tap already opened a claim session. */
  source: "chip" | null;
  /** Chip parameters when the page was opened by a tap; verified here before minting is allowed. */
  tap?: TapParams;
}) {
  const { slug } = keystone;
  const router = useRouter();
  const [access, setAccess] = useState<ClaimAccess>(tap ? "verifying" : source);
  const [tapError, setTapError] = useState<string | null>(null);
  // Sign-in is part of the one slide: the screen shows "securing" while Privy is
  // open, and a closed or failed sign-in puts the slide back.
  const [signingIn, setSigningIn] = useState(false);
  // Privy reported success: the screen moves on to forging while access is checked.
  const [signedIn, setSignedIn] = useState(false);
  const { login } = useLogin({
    onComplete: () => {
      if (claimAfterLogin.current) setSignedIn(true);
    },
    onError: () => {
      claimAfterLogin.current = false;
      setSigningIn(false);
      setSignedIn(false);
    },
  });
  const authedFetch = useAuthedFetch();
  const { status, error: accessError, refetch } = useAccess(slug);

  // Set when the member slides while signed out; the forge resumes after sign-in.
  const claimAfterLogin = useRef(false);
  const [phase, setPhase] = useState<MintPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const galleryHref = `/x/${slug}/gallery`;

  // Opened by a chip: the claim page is already showing; unlock minting once the
  // chip checks out, then drop the tap query so a reload can't replay a single-use tap.
  useEffect(() => {
    if (!tap) return;
    let cancelled = false;
    submitTap(slug, tap).then(({ ok, error: message }) => {
      if (cancelled) return;
      setTapError(ok ? null : message);
      setAccess(ok ? "chip" : "failed");
      window.history.replaceState(null, "", `/x/${slug}`);
    });
    return () => {
      cancelled = true;
    };
    // tap is rebuilt each render; its fields are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tap?.c, tap?.s, tap?.picc_data, tap?.cmac]);

  async function mint() {
    setPhase("minting");
    setError(null);
    try {
      // The server mints to the signed-in user's own wallet; gas is paid
      // by the operator wallet.
      const res = await authedFetch(`/api/k/${slug}/mint`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Forge failed");

      // Straight to the vault: one slide, no stop on a "forged" screen.
      setPhase("minted");
      refetch();
      router.push(galleryHref);
    } catch (e: any) {
      setError(e?.message || "Forge failed");
      setPhase("error");
    }
  }

  // A tap by someone who already holds this keystone goes straight to the gated content.
  const verified = access === "chip";
  useEffect(() => {
    if (verified && status === "holder" && phase === "idle") router.replace(galleryHref);
  }, [verified, status, phase, router, galleryHref]);

  // Resume the claim once Privy login completes and the wallet is known.
  useEffect(() => {
    if (claimAfterLogin.current && status === "not-holder") {
      claimAfterLogin.current = false;
      setSigningIn(false);
      mint();
    } else if (claimAfterLogin.current && status === "holder") {
      // Signed in as someone who already holds it: nothing to forge, straight to the vault.
      claimAfterLogin.current = false;
      setSigningIn(false);
      router.replace(galleryHref);
    } else if (claimAfterLogin.current && status === "revoked") {
      // Signed in as someone whose access was revoked: stop, so the screen shows why.
      claimAfterLogin.current = false;
      setSigningIn(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function onClaim() {
    if (status === "signed-out") {
      claimAfterLogin.current = true;
      setSigningIn(true);
      setSignedIn(false);
      signIn(login, "member");
    } else {
      mint();
    }
  }

  return (
    <PlateClaim
      keystone={keystone}
      status={status}
      access={access}
      phase={phase}
      securing={signingIn}
      signedIn={signedIn}
      error={tapError || error || accessError}
      onClaim={onClaim}
      onEnter={() => router.push(galleryHref)}
    />
  );
}
