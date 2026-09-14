"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { formatCount } from "@vp-parts-shop/shared";
import { useCartItemCount } from "@/hooks/use-cart";

/** Beyond this the badge would outgrow the icon; the cart page has the real figure. */
const BADGE_LIMIT = 99;

/**
 * The header's way into the cart, with the number of pieces in it.
 *
 * The count comes from the hydration-guarded read, so it is 0 in the server HTML
 * and in the first client render whatever the stored cart holds — anything else
 * would be a hydration mismatch on every page of the site.
 */
export function CartLink() {
  const itemCount = useCartItemCount();

  return (
    <Link
      href="/cart"
      className="relative rounded-lg p-2 transition-colors hover:bg-bg-sunken"
      aria-label={
        itemCount > 0 ? `Кошница · ${itemCount} артикула` : "Кошница"
      }
    >
      <ShoppingCart className="h-5 w-5 text-ink" aria-hidden="true" />

      {itemCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 font-display text-[10px] font-bold leading-none tabular-nums text-white"
        >
          {itemCount > BADGE_LIMIT
            ? `${BADGE_LIMIT}+`
            : formatCount(itemCount)}
        </span>
      )}
    </Link>
  );
}
