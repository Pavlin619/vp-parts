"use client";

import { useEffect, useRef } from "react";

/** Land just after the boundary so the recompute sees the new band. */
const CUTOFF_GRACE_MS = 1_000;

/**
 * Furthest ahead a refresh is worth timing. `setTimeout` wraps a delay past
 * ~24.8 days into a near-zero one, which would fire at once and reschedule the
 * same overflow; and a boundary a day out belongs to a page nobody is still
 * looking at, which the read on refocus covers anyway.
 */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

/**
 * Re-reads availability the moment an order cut-off passes.
 *
 * A cut-off is the instant a shown delivery promise stops being true: the band
 * was computed against a deadline that has now gone by, and nothing in the
 * snapshot lets the browser work out the new one — the working-day calendar
 * that would answer it lives on the backend. So the only honest response is to
 * ask again, which is what this does.
 *
 * One timer covers a whole page however many articles it holds: the first
 * boundary is the first moment anything on screen could be wrong, and the read
 * it triggers refreshes every row at once.
 */
export function useCutoffRefresh(
  cutoffAts: string[],
  onRefresh: () => void,
): void {
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  // Joined so the effect keys on the cut-offs themselves rather than on the
  // array's identity — every caller builds the list inline, and keying on the
  // array would tear the timer down and rebuild it on each render.
  const cutoffKey = cutoffAts.join(",");

  useEffect(() => {
    if (!cutoffKey) {
      return;
    }

    const now = Date.now();
    const nextCutoff = cutoffKey
      .split(",")
      .map((iso) => new Date(iso).getTime())
      .filter((cutoffMs) => cutoffMs > now)
      .sort((first, second) => first - second)[0];

    if (nextCutoff === undefined) {
      return;
    }

    const delay = nextCutoff - now + CUTOFF_GRACE_MS;
    if (delay > MAX_TIMER_MS) {
      return;
    }

    const timer = setTimeout(() => onRefreshRef.current(), delay);

    return () => clearTimeout(timer);
  }, [cutoffKey]);
}
