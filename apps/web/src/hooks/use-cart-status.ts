"use client";

import { useQuery } from "@tanstack/react-query";
import { cartQueryOptions, readCartToken } from "@/lib/api/cart";
import { useCartLines } from "./use-cart";
import { useIsHydrated } from "./use-is-hydrated";

/** Which of its three states a cart surface renders: a skeleton, the empty state, or the lines. */
export type CartStatus = "loading" | "empty" | "ready";

/**
 * The cart's state as a page renders it.
 *
 * `loading` until hydration, since the server cannot see the mirror. After
 * that an empty mirror is believed only when there is no cart to ask about or
 * the server has already answered — a device holding a cart token may be about
 * to receive lines filled on another one.
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

  return readCartToken() && !isFetched ? "loading" : "empty";
}
