"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ShippingMethod } from "@vp-parts-shop/shared";
import { useCart } from "@/hooks/use-cart";
import { parcelEstimateQueryOptions } from "@/lib/api/delivery";
import type { ParcelCheck } from "@/lib/checkout/delivery/office-availability";

/** The parcel estimate for the cart version on screen. */
export function useParcelCheck(carrier: ShippingMethod): ParcelCheck {
  const cartId = useCart((state) => state.cartId);
  const cartVersion = useCart((state) => state.version);
  const { data, isError } = useQuery(parcelEstimateQueryOptions(carrier, cartId, cartVersion));

  return useMemo<ParcelCheck>(() => {
    if (data) {
      return { state: "ready", parcel: data };
    }

    return isError ? { state: "failed" } : { state: "checking" };
  }, [data, isError]);
}
