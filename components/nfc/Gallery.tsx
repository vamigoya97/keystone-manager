"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import type { PublicKeystone } from "@/lib/keystones";
import { useAccess } from "@/lib/useAccess";
import { PlateVault, PlateViewer } from "./plate";

/** The vault: holders only. Everyone else goes back to the keystone page to secure it. */
export default function Gallery({ keystone }: { keystone: PublicKeystone }) {
  const { slug } = keystone;
  const router = useRouter();
  const { logout } = usePrivy();
  // Items come from the server only once it has confirmed access.
  const { status, gallery: items } = useAccess(slug);
  const [open, setOpen] = useState<number | null>(null);

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
        onSignOut={holder ? () => logout().then(() => router.replace(`/x/${slug}`)) : undefined}
      />
      {open !== null && holder && items[open] && (
        <PlateViewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} logo={keystone.tokenImage} />
      )}
    </>
  );
}
