"use client";

import { useQuery } from "@tanstack/react-query";
import {
  DeliveryDestinationType,
  type DeliveryAddressDto,
  type DeliveryDestinationDto,
} from "@vp-parts-shop/shared";
import { useCart } from "@/hooks/use-cart";
import { useParcelCheck } from "@/hooks/use-parcel-check";
import {
  useDeliveryMethod,
  useSelectedAddress,
  useSelectedOfficeCode,
} from "@/hooks/use-checkout-delivery";
import { deliveryQuoteQueryOptions } from "@/lib/api/delivery";
import {
  OFFICE_DELIVERY_CARRIER,
  type DeliveryMethod,
} from "@/lib/checkout/delivery/delivery-methods";
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
 * What the selected lines weigh and what delivering them to the chosen office or
 * address costs, both read from the API for the cart version on screen. The quote
 * is asked only once there is a destination and a weighed parcel.
 */
export function useDeliverySummary(): DeliverySummaryState {
  const carrier = OFFICE_DELIVERY_CARRIER;
  const method = useDeliveryMethod();
  const officeCode = useSelectedOfficeCode(carrier);
  const selectedAddress = useSelectedAddress(carrier);
  const cartId = useCart((state) => state.cartId);
  const cartVersion = useCart((state) => state.version);

  const parcelCheck = useParcelCheck(carrier);

  const destination = destinationOf(method, officeCode, selectedAddress?.address ?? null);
  const isQuotable = destination !== null && parcelCheck.state === "ready";
  const quoteQuery = useQuery({
    ...deliveryQuoteQueryOptions(destination && { carrier, destination }, cartId, cartVersion),
    enabled: isQuotable && cartId !== "",
  });

  const delivery = resolveDeliverySummary({
    method,
    destination,
    parcelCheck,
    quote: isQuotable ? quoteQuery : null,
  });

  return { parcelCheck, delivery };
}

function destinationOf(
  method: DeliveryMethod,
  officeCode: string | null,
  address: DeliveryAddressDto | null,
): DeliveryDestinationDto | null {
  if (method === "courier-office") {
    return officeCode ? { type: DeliveryDestinationType.OFFICE, officeCode } : null;
  }

  return address ? { type: DeliveryDestinationType.ADDRESS, address: withoutNote(address) } : null;
}

/** The courier's note does not change the price, so editing it must not ask for a new quote. */
function withoutNote(address: DeliveryAddressDto): DeliveryAddressDto {
  const quotable = { ...address };
  delete quotable.note;

  return quotable;
}
