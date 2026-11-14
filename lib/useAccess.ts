"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { GalleryItem } from "@/lib/keystones";

export type AccessStatus = "loading" | "signed-out" | "holder" | "not-holder" | "revoked";

/** Authenticated fetch against our API using the Privy access token. */
export function useAuthedFetch() {
  const { getAccessToken } = usePrivy();
  return useCallback(
    async (input: string, init: RequestInit = {}) => {
      const token = await getAccessToken();
      return fetch(input, {
        ...init,
        headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    },
    [getAccessToken]
  );
}

/**
 * Server-decided access to an keystone. Holders also receive the gallery;
 * nobody else ever gets the image list.
 */
export function useAccess(slug: string) {
  const { ready, authenticated } = usePrivy();
  const authedFetch = useAuthedFetch();
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const request = useRef(0);
  const [accessCheck, setAccessCheck] = useState(0);
  const refetch = useCallback(() => {
    const check = ++request.current;
    setTick(check);
    return check;
  }, []);

  useEffect(() => {
    if (!ready) return setStatus("loading");
    if (!authenticated) return setStatus("signed-out");

    let cancelled = false;
    setStatus("loading");
    authedFetch(`/api/k/${slug}/access`)
      .then(async (res) => {
        const data = (await res.json()) as {
          holder?: boolean;
          revoked?: boolean;
          gallery?: GalleryItem[];
          error?: string;
        };
        if (cancelled) return;
        setAccessCheck(tick);
        if (!res.ok) {
          setError(data.error ?? "Could not check access");
          return setStatus("not-holder");
        }
        setError(null);
        setGallery(data.gallery ?? []);
        setStatus(data.revoked ? "revoked" : data.holder ? "holder" : "not-holder");
      })
      .catch(() => {
        if (!cancelled) {
          setAccessCheck(tick);
          setError("Network error");
          setStatus("not-holder");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, slug, authedFetch, tick]);

  return { status, gallery, error, refetch, accessCheck };
}
