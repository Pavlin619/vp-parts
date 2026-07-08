"use client";

import { useEffect } from "react";

/**
 * Minimum snapshot age before a focus/visibility change triggers a refresh, so
 * quickly tabbing away and back does not spam the server.
 */
const REFRESH_TTL_MS = 60_000;

/** Land just after a cut-off boundary so the recompute sees the new band. */
const CUTOFF_GRACE_MS = 1_000;

/**
 * Keeps a live delivery snapshot honest on a long-lived detail page. The buy
 * box now fetches availability client-side, so `onRefresh` is a TanStack Query
 * `refetch` that re-reads price/stock in place while preserving client state
 * (quantity, toggles) — no full navigation.
 *
 * It refreshes:
 *  - proactively, via a timer set to the soonest upcoming order cut-off (the
 *    moment a shown date would change);
 *  - reactively, when the tab regains focus after the snapshot has aged.
 */
export function useDeliveryRefresh(
  computedAt: string | null | undefined,
  cutoffAts: string[],
  onRefresh: () => void,
): void {
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
      timer = setTimeout(onRefresh, nextCutoff - now + CUTOFF_GRACE_MS);
    }

    function refreshIfAged() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - new Date(computedAt as string).getTime() > REFRESH_TTL_MS
      ) {
        onRefresh();
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
  }, [computedAt, cutoffAts, onRefresh]);
}
