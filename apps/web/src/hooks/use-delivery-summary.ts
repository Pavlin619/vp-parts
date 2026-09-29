"use client";

import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/hooks/use-cart";
import { useParcelCheck } from "@/hooks/use-parcel-check";
import { useDeliveryMethod, useSelectedOfficeCode } from "@/hooks/use-checkout-delivery";
import { deliveryQuoteQueryOptions } from "@/lib/api/delivery";
import { OFFICE_DELIVERY_CARRIER } from "@/lib/checkout/delivery/delivery-methods";
import {
  resolveDeliverySummary,
  type DeliverySummary,
} from "@/lib/checkout/delivery/delivery-summary";
import type { ParcelCheck } from "@/lib/checkout/delivery/office-availability";

interface DeliverySummaryState {
  parcelCheck: ParcelCheck;
  delivery: DeliverySummary;
}

/**
 * What the selected lines weigh and what delivering them to the chosen office
 * costs, both read from the API for the cart version on screen. The quote is
 * asked only once there is an office and a parcel with a known weight.
 */
export function useDeliverySummary(): DeliverySummaryState {
  const carrier = OFFICE_DELIVERY_CARRIER;
  const method = useDeliveryMethod();
  const officeCode = useSelectedOfficeCode(carrier);
  const cartId = useCart((state) => state.cartId);
  const cartVersion = useCart((state) => state.version);

  const parcelCheck = useParcelCheck(carrier);

  const isQuotable =
    method === "courier-office" &&
    officeCode !== null &&
    parcelCheck.state === "ready" &&
    parcelCheck.parcel.weightGrams !== null;
  const quoteQuery = useQuery({
    ...deliveryQuoteQueryOptions({ carrier, officeCode: officeCode ?? "" }, cartId, cartVersion),
    enabled: isQuotable && cartId !== "",
  });

  const delivery = resolveDeliverySummary({
    method,
    officeCode,
    parcelCheck,
    quote: isQuotable ? quoteQuery : null,
  });

  return { parcelCheck, delivery };
}
