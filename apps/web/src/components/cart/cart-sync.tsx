"use client";

import { useCartSync } from "@/hooks/use-cart-sync";

/**
 * Keeps the mirrored cart in step with the server's.
 *
 * Renders nothing: the cart surfaces paint from the mirror, and this only
 * makes the mirror true. Mounted once at the root, beside the drawer, because
 * the header badge is on every page and has to be right on the first one.
 */
export function CartSync() {
  useCartSync();

  return null;
}
