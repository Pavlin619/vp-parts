"use client";

import { Loader2, ShoppingCart } from "lucide-react";

interface AddToCartIconProps {
  isAdding: boolean;
  className: string;
}

/**
 * The Loader2/ShoppingCart swap every add-to-cart button makes while its own
 * write is in flight, shared so the two states stay one icon each rather than
 * a pair of copies that can drift.
 */
export function AddToCartIcon({ isAdding, className }: AddToCartIconProps) {
  return isAdding ? (
    <Loader2
      data-testid="add-to-cart-icon-spinner"
      className={`${className} animate-spin`}
      aria-hidden="true"
    />
  ) : (
    <ShoppingCart
      data-testid="add-to-cart-icon-cart"
      className={className}
      aria-hidden="true"
    />
  );
}
