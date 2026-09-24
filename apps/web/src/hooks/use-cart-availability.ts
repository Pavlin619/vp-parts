"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { availabilityQueryOptions } from "@/lib/api/catalog";
import { buildCartRows, type CartRowModel } from "@/lib/cart/cart-totals";
import { collectCutoffAts } from "@/lib/delivery/availability";
import type { CartLine } from "./use-cart";
import { useCutoffRefresh } from "./use-cutoff-refresh";

export interface CartAvailability {
  /** Every line joined to the live read, in the cart's order. */
  rows: CartRowModel[];
  /** Nothing has been read yet and nothing has failed. */
  isPending: boolean;
  isError: boolean;
  /** Whether live figures are on screen, which turns a failure into "stale" rather than "missing". */
  hasPrices: boolean;
  refetch: () => void;
}

/**
 * The live price and stock read behind every cart surface.
 *
 * Pass every line in the cart, not just the selected ones: the query key is
 * built from them, so the cart and checkout share one cache entry and moving
 * between them paints without a second read.
 */
export function useCartAvailability(lines: CartLine[]): CartAvailability {
  // Dropping a line changes the key, which would otherwise blank the prices of
  // the lines that stayed. Held here rather than on the shared factory: the buy
  // box keys on one article, where serving the previous key's answer means
  // quoting the part the visitor just navigated away from.
  const { data, isError, refetch } = useQuery({
    ...availabilityQueryOptions(lines),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
  });

  // A cart is the page left open longest, and the one where a delivery promise
  // has to still be true when the customer acts on it.
  useCutoffRefresh(collectCutoffAts(data), refetch);

  return {
    rows: buildCartRows(lines, data ?? (isError ? null : undefined)),
    isPending: lines.length > 0 && data === undefined && !isError,
    isError,
    hasPrices: data !== undefined,
    refetch,
  };
}
