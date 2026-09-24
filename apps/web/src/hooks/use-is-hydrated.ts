"use client";

import { useSyncExternalStore } from "react";

const returnTrue = () => true;
const returnFalse = () => false;
const noopSubscribe = () => () => {};

/**
 * Whether React has hydrated this tree: `false` on the server and on the first
 * client pass, `true` from then on.
 *
 * Guard anything that renders from browser-only state — a `persist`ed Zustand
 * store, `localStorage` — so the server HTML and the first client render match.
 * It says nothing about a store being ready; it only stands in for that because
 * our `persist` stores restore synchronously from `localStorage` on creation.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, returnTrue, returnFalse);
}
