"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Minimum snapshot age before a focus/visibility change triggers a refresh, so
 * quickly tabbing away and back does not spam the server.
 */
const REFRESH_TTL_MS = 60_000;

/** Land just after a cut-off boundary so the server recompute sees the new band. */
const CUTOFF_GRACE_MS = 1_000;

/**
 * Keeps the SSR delivery snapshot honest on a long-lived detail page. The page
 * is dynamic, so `router.refresh()` re-runs it server-side and streams fresh
 * dates back as props while preserving client state (quantity, toggles).
 *
 * It refreshes:
 *  - proactively, via a timer set to the soonest upcoming order cut-off (the
 *    moment a shown date would change);
 *  - reactively, when the tab regains focus after the snapshot has aged.
 */
export function useDeliveryRefresh(
  computedAt: string | null | undefined,
  cutoffAts: string[],
): void {
  const router = useRouter();

  useEffect(() => {
    if (!computedAt) {
      return;
    }

    const now = Date.now();

    const nextCutoff = cutoffAts
      .map((iso) => new Date(iso).getTime())
      .filter((ms) => ms > now)
      .sort((a, b) => a - b)[0];

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (nextCutoff !== undefined) {
      timer = setTimeout(() => router.refresh(), nextCutoff - now + CUTOFF_GRACE_MS);
    }

    function refreshIfAged() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - new Date(computedAt as string).getTime() > REFRESH_TTL_MS
      ) {
        router.refresh();
      }
    }

    document.addEventListener("visibilitychange", refreshIfAged);
    window.addEventListener("focus", refreshIfAged);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", refreshIfAged);
      window.removeEventListener("focus", refreshIfAged);
    };
  }, [computedAt, cutoffAts, router]);
}
