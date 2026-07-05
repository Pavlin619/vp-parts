"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/** Default tick interval — a minute-grained countdown does not need finer. */
const DEFAULT_INTERVAL_MS = 30_000;

/**
 * A `Date` that re-renders the caller on a fixed interval so time-sensitive UI
 * (e.g. an order cut-off countdown) stays live without a manual timer. The
 * interval is cleared on unmount.
 *
 * Returns `null` on the server and for the first client render, then the live
 * time after mount. This is deliberate: reading `new Date()` during render would
 * make the server and client produce different timestamps, breaking hydration
 * for any time-derived output. `useSyncExternalStore` renders the `null` server
 * snapshot during hydration (so the markup matches) and then switches to the
 * live value without a mismatch warning. Callers treat `null` as "not yet live"
 * and render a stable, time-free placeholder.
 */
export function useNow(intervalMs: number = DEFAULT_INTERVAL_MS): Date | null {
  // Cache the snapshot so getSnapshot returns a stable reference between ticks;
  // useSyncExternalStore requires a new reference only when the value changes.
  const snapshot = useRef<Date | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      snapshot.current = new Date();
      onStoreChange();

      const id = setInterval(() => {
        snapshot.current = new Date();
        onStoreChange();
      }, intervalMs);

      return () => clearInterval(id);
    },
    [intervalMs],
  );

  const getSnapshot = useCallback(() => snapshot.current, []);
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
