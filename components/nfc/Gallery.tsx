"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import type { PublicKeystone } from "@/lib/keystones";
import { useAccess } from "@/lib/useAccess";
import ClaimShell from "./ClaimShell";
import { GalleryGrid, GalleryHeader, MediaViewer } from "./views";
import { KeystoneRow, OperatorCard, SectionHeader, groupOperators, usable, useKeystones } from "./member";

export default function Gallery({ keystone }: { keystone: PublicKeystone }) {
  const { slug } = keystone;
  const router = useRouter();
  const { logout } = usePrivy();
  // Images come from the server only once it has confirmed access.
  const { status, gallery: images } = useAccess(slug);
  const [open, setOpen] = useState<number | null>(null);

  // Non-holders go back to the token page to claim.
  useEffect(() => {
    if (status === "signed-out" || status === "not-holder" || status === "revoked") {
      router.replace(`/x/${slug}`);
    }
  }, [status, slug, router]);

  return (
    <ClaimShell keystone={keystone} wide>
      <GalleryHeader
        keystone={keystone}
        actions={
          status === "holder" && (
            <button
              onClick={() => logout().then(() => router.replace(`/x/${slug}`))}
              className="rounded-full px-3 py-1.5 text-[11px] text-white/75 hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          )
        }
      />

      {status !== "holder" ? (
        <GridSkeleton />
      ) : (
        <>
          <GalleryGrid keystone={keystone} images={images} onOpen={setOpen} />
          <YourOtherKeystones slug={slug} operatorId={keystone.operatorId} />
        </>
      )}

      {open !== null && status === "holder" && (
        <MediaViewer items={images} palette={keystone.palette} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </ClaimShell>
  );
}

/**
 * Under the gated content: the member's other keystones from this operator,
 * and the other operators they hold keystones from. Each list only appears
 * when there's something in it, so a one-keystone member just sees the gallery.
 */
function YourOtherKeystones({ slug, operatorId }: { slug: string; operatorId: string }) {
  const { keystones } = useKeystones();
  if (!keystones) return null;

  const groups = groupOperators(keystones);
  const here = groups.find((g) => g.operator.id === operatorId);
  const sameOperator = (here?.keystones ?? []).filter((k) => k.slug !== slug && usable(k));
  const elsewhere = groups.filter((g) => g.operator.id !== operatorId && g.active.length > 0);
  if (sameOperator.length === 0 && elsewhere.length === 0) return null;

  return (
    <div className="mt-12 space-y-10 border-t border-border-subtle pt-8">
      {sameOperator.length > 0 && here && (
        <section aria-label={`More from ${here.operator.name}`}>
          <SectionHeader title={`More from ${here.operator.name}`} count={sameOperator.length} href={`/o/${operatorId}`} />
          <div className="grid gap-3 sm:grid-cols-2">
            {sameOperator.map((k) => (
              <KeystoneRow key={k.slug} keystone={k} />
            ))}
          </div>
        </section>
      )}

      {elsewhere.length > 0 && (
        <section aria-label="Your other operators">
          <SectionHeader title="Your other operators" count={elsewhere.length} href="/operators" />
          <div className="grid gap-3 sm:grid-cols-2">
            {elsewhere.map((g) => (
              <OperatorCard key={g.operator.id} group={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GridSkeleton() {
  const heights = [220, 160, 260, 190, 240, 170, 210, 250];
  return (
    <div className="mt-6 columns-2 gap-3" aria-busy>
      {heights.map((h, i) => (
        <div key={i} className="mb-3 animate-pulse rounded-2xl bg-surface-raised" style={{ height: h }} />
      ))}
    </div>
  );
}
