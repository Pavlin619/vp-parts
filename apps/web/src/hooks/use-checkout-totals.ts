"use client";

import { useQuery } from "@tanstack/react-query";
import type { CartTotalsDto } from "@vp-parts-shop/shared";
import { checkoutTotalsQueryOptions } from "@/lib/api/checkout";
import { useCart } from "./use-cart";

export interface CheckoutTotals {
  /** Undefined until read, and after a failed first read. */
  totals: CartTotalsDto | undefined;
  isError: boolean;
  /** The totals are an earlier cart version's, shown while the current one is read. */
  isRecalculating: boolean;
  refetch: () => void;
}

/** The selected lines' money as the API prices it, for the cart version on screen. */
export function useCheckoutTotals(): CheckoutTotals {
  const cartId = useCart((state) => state.cartId);
  const cartVersion = useCart((state) => state.version);
  const { data, isError, isPlaceholderData, refetch } = useQuery(
    checkoutTotalsQueryOptions(cartId, cartVersion),
  );

  return {
    totals: data,
    isError,
    isRecalculating: isPlaceholderData,
    refetch: () => void refetch(),
  };
}
