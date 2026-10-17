import { queryOptions, skipToken } from "@tanstack/react-query";
import type {
  DeliveryQuoteDto,
  DeliveryQuoteRequestDto,
  ParcelEstimateDto,
  ShippingMethod,
} from "@vp-parts-shop/shared";
import { ApiError } from "./index";
import { cartFetch } from "./cart/cart-fetch";

/** The API caches a quote for five minutes; asking sooner would only read that copy. */
const QUOTE_STALE_TIME_MS = 5 * 60 * 1000;

const MAX_QUOTE_OUTAGE_RETRIES = 2;

/** What the requester's selected cart lines weigh as one parcel for this carrier. */
export function getParcelEstimate(
  carrier: ShippingMethod,
): Promise<ParcelEstimateDto> {
  return cartFetch<ParcelEstimateDto>(`/checkout/parcel?${new URLSearchParams({ carrier })}`);
}

/** The delivery's price and date for the requester's selected lines, and the whole order's money. */
export function getDeliveryQuote(request: DeliveryQuoteRequestDto): Promise<DeliveryQuoteDto> {
  return cartFetch<DeliveryQuoteDto>("/checkout/quote", { method: "POST", body: request });
}

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
    queryKey: ["checkout", "parcel", carrier, cartId, cartVersion] as const,
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
      "checkout",
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

/** A 4xx answers the same on a retry; only an outage is worth asking again. */
function isRefusal(error: Error): boolean {
  return error instanceof ApiError && error.statusCode < 500;
}
