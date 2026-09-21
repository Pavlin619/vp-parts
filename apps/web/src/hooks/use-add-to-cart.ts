"use client";

import { useCallback, useState } from "react";
import { useCart, type CartLineArticle } from "./use-cart";
import { useCartDrawer } from "./use-cart-drawer";

export interface UseAddToCartResult {
  addToCart: (
    article: CartLineArticle,
    quantity: number,
    priceIncVat?: number | null,
  ) => void;
  /**
   * Whether this call site's own add is still writing through to the server.
   * Local to the hook instance, so one row's spinner never lights up another
   * row's button — see {@link CartState.addLine}'s returned promise.
   */
  isAddingToCart: boolean;
}

/**
 * Adding a part to the cart, as every buy button does it: the line goes in and
 * the cart drawer comes up over the page to confirm it.
 *
 * One hook rather than the two calls at each call site, because a surface that
 * added a part without showing what happened would leave the visitor with no
 * feedback at all — and a catalog row, a buy box and whatever is built next
 * must not be able to disagree about that.
 *
 * `priceIncVat` is the live figure the visitor was looking at. It is kept as
 * the line's reference point, never as its price: the cart compares it to the
 * live read to say the price has moved, and renders only the live one.
 */
export function useAddToCart(): UseAddToCartResult {
  const addLine = useCart((state) => state.addLine);
  const openCartDrawer = useCartDrawer((state) => state.openCartDrawer);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const addToCart = useCallback(
    (
      article: CartLineArticle,
      quantity: number,
      priceIncVat: number | null = null,
    ) => {
      setIsAddingToCart(true);

      const written = addLine(article, quantity, priceIncVat);
      openCartDrawer();

      // Not caught here: a refused or failed write is the store's concern
      // (it falls back to re-reading the cart), not this button's.
      void written.finally(() => setIsAddingToCart(false));
    },
    [addLine, openCartDrawer],
  );

  return { addToCart, isAddingToCart };
}
