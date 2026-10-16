import { queryOptions, skipToken } from "@tanstack/react-query";
import type {
  DeliveryAddressDto,
  DeliveryAddressValidationDto,
  DeliveryOfficeDto,
  DeliveryQuarterDto,
  DeliveryStreetDto,
  DeliveryPlaceDto,
  DeliveryQuoteDto,
  DeliveryQuoteRequestDto,
  ParcelEstimateDto,
  ShippingMethod,
} from "@vp-parts-shop/shared";
import { ApiError, apiFetch } from "./index";
import { cartFetch } from "./cart/cart-fetch";

/** The hour the API lets offices and places be cached. */
const CARRIER_LIST_STALE_TIME_MS = 60 * 60 * 1000;

/** The API caches a quote for five minutes; asking sooner would only read that copy. */
const QUOTE_STALE_TIME_MS = 5 * 60 * 1000;

const MAX_QUOTE_OUTAGE_RETRIES = 2;

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

/** What the requester's selected cart lines weigh as one parcel for this carrier. */
export function getParcelEstimate(
  carrier: ShippingMethod,
): Promise<ParcelEstimateDto> {
  return cartFetch<ParcelEstimateDto>(`/delivery/parcel?${carrierParam(carrier)}`);
}

/** The carrier's price and expected date for the requester's selected lines to one office. */
export function getDeliveryQuote(request: DeliveryQuoteRequestDto): Promise<DeliveryQuoteDto> {
  return cartFetch<DeliveryQuoteDto>("/delivery/quote", { method: "POST", body: request });
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

/** Keyed like the parcel estimate: a changed cart is a new parcel and so a new price. */
export const deliveryQuoteQueryOptions = (
  request: DeliveryQuoteRequestDto | null,
  cartId: string,
  cartVersion: number,
) =>
  queryOptions({
    queryKey: [
      "delivery",
      "quote",
      request?.carrier,
      request?.destination,
      request?.isCashOnDelivery,
      cartId,
      cartVersion,
    ] as const,
    queryFn: request ? () => getDeliveryQuote(request) : skipToken,
    staleTime: QUOTE_STALE_TIME_MS,
    enabled: request !== null && cartId !== "",
    retry: (failureCount: number, error: Error) =>
      !isRefusal(error) && failureCount < MAX_QUOTE_OUTAGE_RETRIES,
  });

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

/** A 4xx answers the same on a retry; only an outage is worth asking again. */
function isRefusal(error: Error): boolean {
  return error instanceof ApiError && error.statusCode < 500;
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
