import { queryOptions } from "@tanstack/react-query";
import type {
  DeliveryAddressDto,
  DeliveryAddressValidationDto,
  DeliveryOfficeDto,
  DeliveryQuarterDto,
  DeliveryStreetDto,
  DeliveryPlaceDto,
  ShippingMethod,
} from "@vp-parts-shop/shared";
import { apiFetch } from "./index";

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

export function getDeliveryAddressPlaces(carrier: ShippingMethod): Promise<DeliveryPlaceDto[]> {
  return apiFetch<DeliveryPlaceDto[]>(`/delivery/address-places?${carrierParam(carrier)}`);
}

export function validateDeliveryAddress(request: {
  carrier: ShippingMethod;
  address: DeliveryAddressDto;
}): Promise<DeliveryAddressValidationDto> {
  return apiFetch<DeliveryAddressValidationDto>("/delivery/address/validate", {
    method: "POST",
    body: request,
  });
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

export const deliveryAddressPlacesQueryOptions = (carrier: ShippingMethod) =>
  queryOptions({
    queryKey: ["delivery", "address-places", carrier] as const,
    queryFn: () => getDeliveryAddressPlaces(carrier),
    staleTime: CARRIER_LIST_STALE_TIME_MS,
  });

export const deliveryStreetSuggestionsQueryOptions = (
  carrier: ShippingMethod,
  placeId: string | null,
  query: string,
) => nameSuggestionsQueryOptions<DeliveryStreetDto>("streets", carrier, placeId, query);

export const deliveryQuarterSuggestionsQueryOptions = (
  carrier: ShippingMethod,
  placeId: string | null,
  query: string,
) => nameSuggestionsQueryOptions<DeliveryQuarterDto>("quarters", carrier, placeId, query);

function nameSuggestionsQueryOptions<Suggestion>(
  list: "streets" | "quarters",
  carrier: ShippingMethod,
  placeId: string | null,
  query: string,
) {
  const trimmed = query.trim();

  return queryOptions({
    queryKey: ["delivery", list, carrier, placeId, trimmed] as const,
    queryFn: () =>
      apiFetch<Suggestion[]>(
        `/delivery/${list}?${new URLSearchParams({ carrier, placeId: placeId ?? "", q: trimmed })}`,
      ),
    staleTime: CARRIER_LIST_STALE_TIME_MS,
    enabled: placeId !== null && trimmed !== "",
  });
}

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
