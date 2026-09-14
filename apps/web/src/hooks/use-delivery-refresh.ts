"use client";

import { useEffect } from "react";
import { useCutoffRefresh } from "./use-cutoff-refresh";

/**
 * Minimum snapshot age before a focus/visibility change triggers a refresh, so
 * quickly tabbing away and back does not spam the server.
 */
const REFRESH_TTL_MS = 60_000;

/** A snapshot with no cut-offs to schedule against, as one stable reference. */
const NO_CUTOFFS: string[] = [];

/**
 * Keeps a live delivery snapshot honest on a long-lived detail page. The buy
 * box now fetches availability client-side, so `onRefresh` is a TanStack Query
 * `refetch` that re-reads price/stock in place while preserving client state
 * (quantity, toggles) — no full navigation.
 *
 * It refreshes:
 *  - proactively, when an order cut-off passes (see {@link useCutoffRefresh});
 *  - reactively, when the tab regains focus after the snapshot has aged.
 *
 * The focus half is this page's alone: a detail page is the one a visitor
 * leaves open, and it holds a date rather than the relative band a list shows.
 */
export function useDeliveryRefresh(
  computedAt: string | null | undefined,
  cutoffAts: string[],
  onRefresh: () => void,
): void {
  useCutoffRefresh(computedAt ? cutoffAts : NO_CUTOFFS, onRefresh);

  useEffect(() => {
    if (!computedAt) {
      return;
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
      document.removeEventListener("visibilitychange", refreshIfAged);
      window.removeEventListener("focus", refreshIfAged);
    };
  }, [computedAt, onRefresh]);
}
