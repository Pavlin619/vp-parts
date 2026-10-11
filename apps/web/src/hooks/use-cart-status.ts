"use client";

import { useQuery } from "@tanstack/react-query";
import { cartQueryOptions } from "@/lib/api/cart";
import { useCartLines } from "./use-cart";
import { useIsHydrated } from "./use-is-hydrated";

/** Which of its three states a cart surface renders: a skeleton, the empty state, or the lines. */
export type CartStatus = "loading" | "empty" | "ready";

/**
 * The cart's state as a page renders it.
 *
 * `loading` until hydration, since the server cannot see the mirror. After
 * that an empty mirror is believed only once the server has answered — a
 * device holding a cart token, or a signed-in customer, may be about to
 * receive lines filled on another device, and which of those this visitor is
 * is known only once Clerk has loaded.
 */
export function useCartStatus(): CartStatus {
  const isHydrated = useIsHydrated();
  const lineCount = useCartLines().length;
  // Observes the read `CartSync` owns, without starting a second one.
  const { isFetched } = useQuery({ ...cartQueryOptions, enabled: false });

  if (!isHydrated) {
    return "loading";
  }

  if (lineCount > 0) {
    return "ready";
  }

  return isFetched ? "empty" : "loading";
}
