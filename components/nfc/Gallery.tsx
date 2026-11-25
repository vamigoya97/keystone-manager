"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicKeystone } from "@/lib/keystones";
import { useAccess } from "@/lib/useAccess";
import { useHoldsOthers } from "./member";
import { PlateVault, PlateViewer } from "./plate";

/** The vault: holders only. Everyone else goes back to the keystone page to secure it. */
export default function Gallery({ keystone }: { keystone: PublicKeystone }) {
  const { slug } = keystone;
  const router = useRouter();
  // Items come from the server only once it has confirmed access.
  const { status, gallery: items } = useAccess(slug);
  const [open, setOpen] = useState<number | null>(null);
  const holdsOthers = useHoldsOthers(slug);

  useEffect(() => {
    if (status === "signed-out" || status === "not-holder" || status === "revoked") {
      router.replace(`/x/${slug}`);
    }
  }, [status, slug, router]);

  const holder = status === "holder";

  return (
    <>
      <PlateVault
        keystone={keystone}
        items={holder ? items : []}
        loading={!holder}
        onOpen={setOpen}
        myKeystones={holder && holdsOthers}
      />
      {open !== null && holder && items[open] && (
        <PlateViewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} logo={keystone.tokenImage} />
      )}
    </>
  );
}
