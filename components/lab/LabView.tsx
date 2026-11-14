"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { GalleryItem, PublicKeystone } from "@/lib/keystones";
import type { AccessStatus } from "@/lib/useAccess";
import PhonePreview from "@/components/admin/PhonePreview";
import ArrangeGrid, { step, toggleWide } from "@/components/admin/ArrangeGrid";
import { canBeWide } from "@/lib/gallery";
import type { MemberKeystone } from "@/components/nfc/member";
import { PlateClaim, PlateHome, PlateVault, PlateViewer, type ClaimAccess, type MintPhase } from "@/components/nfc/plate";

type ClaimCase = {
  id: string;
  title: string;
  note: string;
  status: AccessStatus;
  access: ClaimAccess;
  phase: MintPhase;
  securing?: boolean;
  error?: string;
};

const CLAIM_CASES: ClaimCase[] = [
  { id: "i", title: "i · Tap keystone", note: "The rough diamond stays disabled while the chip is checked", status: "signed-out", access: "verifying", phase: "idle" },
  { id: "ii", title: "ii · Tap to secure", note: "Tap the diamond to continue: log in (when signed out), forge, then the vault", status: "signed-out", access: "chip", phase: "idle" },
  { id: "iii", title: "iii · Log in", note: "Privy sign-in, only when signed out; forging follows on its own", status: "signed-out", access: "chip", phase: "idle", securing: true },
  { id: "iv", title: "iv · Open the vault", note: "Forging, then the vault opens on its own: no second tap", status: "not-holder", access: "chip", phase: "minting" },
  { id: "holder", title: "Holder returns", note: "Already holds it, without a fresh tap: tap the diamond to enter the vault", status: "holder", access: null, phase: "idle" },
  { id: "failed", title: "Not aligned", note: "The diamond stays disabled; tap the item again", status: "signed-out", access: "failed", phase: "idle", error: "This keystone couldn't be aligned." },
  { id: "no-tap", title: "No tap yet", note: "The diamond stays disabled until the item is tapped", status: "signed-out", access: null, phase: "idle" },
  { id: "error", title: "Forge failed", note: "Tap the diamond to retry", status: "not-holder", access: "chip", phase: "error", error: "The network is busy. Try again." },
];

/**
 * Every member screen and state side by side, rendered by the live components
 * (components/nfc/plate.tsx) with sample state. Change a component and every
 * phone updates.
 */
export default function LabView({
  keystone,
  options,
  items,
  held,
  motion,
}: {
  keystone: PublicKeystone;
  options: { slug: string; name: string }[];
  items: GalleryItem[];
  held: MemberKeystone[];
  /** Show the claim motion set (film grain, artwork press, and ripple). */
  motion: boolean;
}) {
  const router = useRouter();
  const go = (slug: string, m: boolean) => router.push(`/lab?k=${encodeURIComponent(slug)}${m ? "&motion=1" : ""}`);

  return (
    <main className="min-h-screen bg-surface px-6 py-8 sm:px-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] text-text-secondary">Design lab, development only</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Member screens</h1>
          <a href="/lab/console" className="mt-1 inline-block text-[13px] text-accent">
            Operator console (sample data) ↗
          </a>
          <p className="mt-1 max-w-xl text-[13px] text-text-secondary">
            The live components with sample state. Edit <code className="font-mono text-text-primary">components/nfc/plate.tsx</code> and every phone updates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
        <div role="group" aria-label="Claim motion set" className="flex rounded-xl border border-border-default bg-surface-raised p-1 text-[13px]">
          {[false, true].map((m) => (
            <button
              key={String(m)}
              aria-pressed={motion === m}
              onClick={() => go(keystone.slug, m)}
              className={`rounded-lg px-3 py-1.5 ${motion === m ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
            >
              {m ? "Motion set" : "Still"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-text-secondary">
          Keystone
          <select
            value={keystone.slug}
            onChange={(e) => go(e.target.value, motion)}
            className="rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-[13px] text-text-primary"
          >
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        </div>
      </header>

      <Section title="Secure (claim)" href={`/x/${keystone.slug}`}>
        {CLAIM_CASES.map((c) => (
          <ClaimPhone key={`${keystone.slug}-${c.id}-${motion}`} keystone={keystone} c={c} items={items} motion={motion} />
        ))}
      </Section>

      <Section title="The vault" href={`/x/${keystone.slug}/gallery`}>
        <VaultPhone keystone={keystone} items={items} />
      </Section>

      <Section title="Arrange (Gallery tab)" href="/operator">
        <ArrangeDemo keystone={keystone} items={items} />
      </Section>

      <Section title="Member home" href="/">
        <Phone title="Signed out" note="Anyone opening / without a session">
          <PlateHome state="signed-out" keystones={[]} contained />
        </Phone>
        <Phone title="Home" note="Claimed keystones, two per row; tap opens the vault">
          <PlateHome state="ready" keystones={held} onSignOut={() => {}} contained />
        </Phone>
        <Phone title="Home, empty" note="Signed in, nothing claimed yet">
          <PlateHome state="ready" keystones={[]} onSignOut={() => {}} contained />
        </Phone>
      </Section>
    </main>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <section className="mb-14">
      <div className="mb-5 flex items-baseline gap-3 border-b border-border-subtle pb-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <a href={href} className="font-mono text-[11px] text-text-muted hover:text-accent">
          {href}
        </a>
      </div>
      <div className="flex flex-wrap gap-8">{children}</div>
    </section>
  );
}

function Phone({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <figure>
      <PhonePreview>
        <div className="h-full overflow-y-auto">{children}</div>
      </PhonePreview>
      <figcaption className="mt-3 max-w-[312px]">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-[12px] text-text-muted">{note}</span>
      </figcaption>
    </figure>
  );
}

/** One claim state. Tapping the diamond plays the flow: log in (when signed out), forging, then the vault, automatically. */
function ClaimPhone({ keystone, c, items, motion }: { keystone: PublicKeystone; c: ClaimCase; items: GalleryItem[]; motion: boolean }) {
  const [phase, setPhase] = useState<MintPhase>(c.phase);
  const [access, setAccess] = useState(c.access);

  // With the motion set, the aligning phone loops checking → aligned to preview the alignment reveal.
  useEffect(() => {
    if (!motion || c.id !== "i") return;
    const id = setInterval(() => setAccess((a) => (a === "verifying" ? "chip" : "verifying")), 3200);
    return () => clearInterval(id);
  }, [motion, c.id]);

  const [signIn, setSignIn] = useState(false);
  const [inVault, setInVault] = useState(false);
  const [run, setRun] = useState(0);

  function reset() {
    setPhase(c.phase);
    setSignIn(false);
    setInVault(false);
    setRun((r) => r + 1);
  }

  function finishSecuring() {
    setPhase("minting");
    setTimeout(() => setInVault(true), 1500);
    setTimeout(reset, 5000);
  }

  return (
    <figure>
      <PhonePreview>
        <div key={run} className="h-full overflow-y-auto">
          {inVault ? (
            <PlateVault keystone={keystone} items={items} onOpen={() => {}} contained animateGalleryEntrance />
          ) : (
            <PlateClaim
              keystone={keystone}
              status={c.status}
              access={access}
              phase={phase}
              securing={signIn || !!c.securing}
              error={c.error}
              onClaim={() => (c.status === "signed-out" ? setSignIn(true) : finishSecuring())}
              onEnter={() => {
                setInVault(true);
                setTimeout(reset, 3500);
              }}
              contained
              motion={motion}
            />
          )}
        </div>
        {signIn && (
          <SignInSheet
            onContinue={() => {
              setSignIn(false);
              finishSecuring();
            }}
            onCancel={reset}
          />
        )}
      </PhonePreview>
      <figcaption className="mt-3 max-w-[312px]">
        <span className="block text-[13px] font-medium">{c.title}</span>
        <span className="block text-[12px] text-text-muted">{c.note}</span>
      </figcaption>
    </figure>
  );
}

/** Stand-in for Privy's sign-in so the flow can be walked through without an account. */
function SignInSheet({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/40">
      <div className="w-full rounded-t-2xl bg-white p-6 text-[#161616]">
        <p className="text-[17px] font-semibold">Sign in to secure your keystone</p>
        <p className="mt-1 text-[13px] text-[#66665F]">Sample sign-in. The live app shows Privy here.</p>
        <div className="mt-5 h-12 rounded-md border border-[#CDCDC8] px-3 text-[15px] leading-[48px] text-[#66665F]">you@example.com</div>
        <button onClick={onContinue} className="mt-3 h-12 w-full rounded-md bg-[#161616] text-[15px] font-medium text-white">
          Continue
        </button>
        <button onClick={onCancel} className="mt-2 h-10 w-full text-[13px] text-[#66665F]">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The Gallery tab's drag-and-drop grid with sample items (not saved), next to the vault it produces. */
function ArrangeDemo({ keystone, items: initial }: { keystone: PublicKeystone; items: GalleryItem[] }) {
  const [items, setItems] = useState(initial);
  return (
    <>
      <div className="w-full max-w-[560px]" data-arrange>
        <p className="mb-3 text-[12px] text-text-muted">
          Drag a tile onto the left or right half of another to pair them, or onto a bar between rows for full width. Sample only, nothing is saved.
        </p>
        <ArrangeGrid
          items={items}
          onArrange={setItems}
          controls={(i) => {
            const key = items[i].key ?? items[i].src;
            const btn = "h-7 rounded-md bg-black/60 px-2 text-[12px] text-white";
            return (
              <>
                <button className={btn} aria-label="Move earlier" onClick={() => setItems((x) => step(x, key, -1) ?? x)}>←</button>
                {canBeWide(items[i]) && (
                  <button className={btn} onClick={() => setItems((x) => toggleWide(x, key) ?? x)}>
                    {items[i].wide ? "Half width" : "Full width"}
                  </button>
                )}
                <button className={btn} aria-label="Move later" onClick={() => setItems((x) => step(x, key, 1) ?? x)}>→</button>
              </>
            );
          }}
        />
      </div>
      <figure>
        <PhonePreview>
          <div className="h-full overflow-y-auto">
            <PlateVault keystone={keystone} items={items} onOpen={() => {}} contained />
          </div>
        </PhonePreview>
        <figcaption className="mt-3 max-w-[312px]">
          <span className="block text-[13px] font-medium">Result</span>
          <span className="block text-[12px] text-text-muted">The vault updates as you arrange</span>
        </figcaption>
      </figure>
    </>
  );
}

function VaultPhone({ keystone, items }: { keystone: PublicKeystone; items: GalleryItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <figure>
      <PhonePreview>
        <div className="h-full overflow-y-auto">
          <PlateVault keystone={keystone} items={items} onOpen={setOpen} onSignOut={() => {}} contained />
        </div>
        {open !== null && items[open] && <PlateViewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} logo={keystone.tokenImage} contained />}
      </PhonePreview>
      <figcaption className="mt-3 max-w-[312px]">
        <span className="block text-[13px] font-medium">Vault</span>
        <span className="block text-[12px] text-text-muted">Gallery first, edge to edge; the description and attributes follow</span>
      </figcaption>
    </figure>
  );
}
