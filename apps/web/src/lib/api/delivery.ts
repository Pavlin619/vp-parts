import { queryOptions } from "@tanstack/react-query";
import type {
  DeliveryOfficeDto,
  ParcelEstimateDto,
  ShippingMethod,
} from "@vp-parts-shop/shared";
import { apiFetch } from "./index";
import { cartFetch } from "./cart/cart-fetch";

const OFFICES_STALE_TIME_MS = 60 * 60 * 1000;

export function getDeliveryOffices(
  carrier: ShippingMethod,
): Promise<DeliveryOfficeDto[]> {
  return apiFetch<DeliveryOfficeDto[]>(`/delivery/offices?${carrierParam(carrier)}`);
}

/** What the requester's selected cart lines weigh as one parcel for this carrier. */
export function getParcelEstimate(
  carrier: ShippingMethod,
): Promise<ParcelEstimateDto> {
  return cartFetch<ParcelEstimateDto>(`/delivery/parcel?${carrierParam(carrier)}`);
}

export const deliveryOfficesQueryOptions = (carrier: ShippingMethod) =>
  queryOptions({
    queryKey: ["delivery", "offices", carrier] as const,
    queryFn: () => getDeliveryOffices(carrier),
    staleTime: OFFICES_STALE_TIME_MS,
    select: sortOfficesByPlace,
  });

/**
 * Keyed by the cart and its version, so a changed quantity or selection — or the
 * account cart adopted at sign-in — is a new entry, and an entry never goes stale.
 */
export const parcelEstimateQueryOptions = (
  carrier: ShippingMethod,
  cartId: string,
  cartVersion: number,
) =>
  queryOptions({
    queryKey: ["delivery", "parcel", carrier, cartId, cartVersion] as const,
    queryFn: () => getParcelEstimate(carrier),
    staleTime: Infinity,
    enabled: cartId !== "",
  });

function carrierParam(carrier: ShippingMethod): URLSearchParams {
  return new URLSearchParams({ carrier });
}

function sortOfficesByPlace(offices: DeliveryOfficeDto[]): DeliveryOfficeDto[] {
  return [...offices].sort(
    (first, second) =>
      first.city.localeCompare(second.city, "bg") ||
      first.name.localeCompare(second.name, "bg"),
  );
}
