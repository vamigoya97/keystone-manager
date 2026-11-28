"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { galleryKind, type GalleryItem, type PublicKeystone } from "@/lib/keystones";
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
  const imagesReady = useFirstImages(holder ? items : null);

  return (
    <>
      <PlateVault
        keystone={keystone}
        items={holder ? items : []}
        loading={!holder || !imagesReady}
        onOpen={setOpen}
        myKeystones={holder && holdsOthers}
      />
      {open !== null && holder && items[open] && (
        <PlateViewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} logo={keystone.tokenImage} />
      )}
    </>
  );
}

/**
 * True once the vault's first images have loaded (or failed), so the gallery and
 * the description can appear together instead of tiles popping in one by one.
 * Gives up waiting after 3 seconds; videos, audio and QR cards don't hold it up.
 */
function useFirstImages(items: GalleryItem[] | null, count = 6, timeoutMs = 3000) {
  const [ready, setReady] = useState(false);
  const srcs = (items ?? []).filter((i) => galleryKind(i) === "image").slice(0, count).map((i) => i.src);
  const key = items ? srcs.join("|") : null;
  useEffect(() => {
    if (key === null) { setReady(false); return; }
    if (!key) { setReady(true); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; setReady(true); } };
    const timer = setTimeout(finish, timeoutMs);
    Promise.all(
      key.split("|").map((src) => new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = src;
      })),
    ).then(finish);
    return () => { done = true; clearTimeout(timer); };
  }, [key, timeoutMs]);
  return ready;
}
