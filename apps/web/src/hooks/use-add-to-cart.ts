"use client";

import { useCallback } from "react";
import { useCart, type CartLineArticle } from "./use-cart";
import { useCartDrawer } from "./use-cart-drawer";

/**
 * Adding a part to the cart, as every buy button does it: the line goes in and
 * the cart drawer comes up over the page to confirm it.
 *
 * One hook rather than the two calls at each call site, because a surface that
 * added a part without showing what happened would leave the visitor with no
 * feedback at all — and a catalog row, a buy box and whatever is built next
 * must not be able to disagree about that.
 */
export function useAddToCart() {
  const addLine = useCart((state) => state.addLine);
  const openCartDrawer = useCartDrawer((state) => state.openCartDrawer);

  return useCallback(
    (article: CartLineArticle, quantity: number) => {
      addLine(article, quantity);
      openCartDrawer();
    },
    [addLine, openCartDrawer],
  );
}
