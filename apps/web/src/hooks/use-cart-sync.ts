"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { cartQueryOptions } from "@/lib/api/cart";
import { useCart } from "./use-cart";

/**
 * Reconciles the mirrored cart with the server's.
 *
 * Mounted once, high in the tree. The mirror is what every cart surface paints
 * from — instantly, from `localStorage`, before this read returns — and this is
 * what makes it true: a cart filled on another device, or a line that expired,
 * arrives here.
 *
 * A failed read changes nothing on screen but is still named for the write
 * error banner, since nothing else on the page would otherwise say the cart
 * did not load. The mirror is the customer's own last known cart, which is a
 * better thing to show an offline shopper than an empty one.
 */
export function useCartSync() {
  const { data, isError } = useQuery(cartQueryOptions);
  const adoptServerCart = useCart((state) => state.adoptServerCart);
  const reportSyncFailure = useCart((state) => state.reportSyncFailure);

  useEffect(() => {
    // A mirror ahead of the server — a write still in flight or waiting out
    // its debounce — knows more than this read does; adopting it here would
    // rewind an optimistic change that hasn't been answered yet.
    if (data && !useCart.getState().hasPendingWrite()) {
      adoptServerCart(data);
    }
  }, [data, adoptServerCart]);

  useEffect(() => {
    if (isError) {
      reportSyncFailure();
    }
  }, [isError, reportSyncFailure]);

  return { isError };
}
