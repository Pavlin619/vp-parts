"use client";

import { useSyncExternalStore } from "react";
import { orderAccessKeyOf } from "@vp-parts-shop/shared";

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);

  return () => window.removeEventListener("hashchange", onChange);
}

const readAccessKey = () => orderAccessKeyOf(window.location.hash);

const notYetRead = () => undefined;

/**
 * The key a guest's order link carries in its fragment, which only the browser
 * sees: `undefined` until hydrated, then the key, or null for a link without one.
 */
export function useOrderAccessKey(): string | null | undefined {
  return useSyncExternalStore(subscribeToHash, readAccessKey, notYetRead);
}
