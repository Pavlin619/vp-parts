import { queryOptions } from "@tanstack/react-query";
import type {
  DeliveryOfficeDto,
  DeliveryPlaceDto,
  ParcelEstimateDto,
  ShippingMethod,
} from "@vp-parts-shop/shared";
import { apiFetch } from "./index";
import { cartFetch } from "./cart/cart-fetch";

/** The hour the API lets offices and places be cached. */
const CARRIER_LIST_STALE_TIME_MS = 60 * 60 * 1000;

export function getDeliveryOffices(
  carrier: ShippingMethod,
): Promise<DeliveryOfficeDto[]> {
  return apiFetch<DeliveryOfficeDto[]>(`/delivery/offices?${carrierParam(carrier)}`);
}

export function getDeliveryPlaces(
  carrier: ShippingMethod,
): Promise<DeliveryPlaceDto[]> {
  return apiFetch<DeliveryPlaceDto[]>(`/delivery/places?${carrierParam(carrier)}`);
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
    staleTime: CARRIER_LIST_STALE_TIME_MS,
    select: sortOfficesByPlace,
  });

export const deliveryPlacesQueryOptions = (carrier: ShippingMethod) =>
  queryOptions({
    queryKey: ["delivery", "places", carrier] as const,
    queryFn: () => getDeliveryPlaces(carrier),
    staleTime: CARRIER_LIST_STALE_TIME_MS,
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
