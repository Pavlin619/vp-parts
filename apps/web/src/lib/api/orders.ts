import { queryOptions } from "@tanstack/react-query";
import {
  CART_TOKEN_HEADER,
  ORDER_KEY_HEADER,
  type OrderDetailDto,
  type PlaceOrderRequestDto,
  type PlaceOrderResponseDto,
  type QuickOrderRequestDto,
  type QuickOrderResponseDto,
} from "@vp-parts-shop/shared";
import { readCartToken } from "./cart/cart-token";
import { apiFetch, isRefusal } from "./index";

const MAX_ORDER_OUTAGE_RETRIES = 2;

/** Safe to repeat: the cart is the key, so a retry answers with the order already placed. */
export function placeOrder(request: PlaceOrderRequestDto): Promise<PlaceOrderResponseDto> {
  return apiFetch("/orders", { method: "POST", body: request, withSession: true });
}

/** A guest's order of the cart this device's token holds; safe to repeat, as `placeOrder` is. */
export function placeQuickOrder(request: QuickOrderRequestDto): Promise<QuickOrderResponseDto> {
  const token = readCartToken();

  return apiFetch("/orders/quick", {
    method: "POST",
    body: request,
    headers: token ? { [CART_TOKEN_HEADER]: token } : undefined,
  });
}

export function getOrder(orderReference: string): Promise<OrderDetailDto> {
  return apiFetch(`/orders/${encodeURIComponent(orderReference)}`, { withSession: true });
}

export function getGuestOrder(orderReference: string, accessKey: string): Promise<OrderDetailDto> {
  return apiFetch(`/orders/guest/${encodeURIComponent(orderReference)}`, {
    headers: { [ORDER_KEY_HEADER]: accessKey },
  });
}

/** With the key a guest's link carries, the order is read with it rather than the account. */
export const orderQueryOptions = (orderReference: string, accessKey: string | null = null) =>
  queryOptions({
    queryKey: ["orders", "order", orderReference, accessKey] as const,
    queryFn: () =>
      accessKey ? getGuestOrder(orderReference, accessKey) : getOrder(orderReference),
    retry: (failureCount: number, error: Error) =>
      !isRefusal(error) && failureCount < MAX_ORDER_OUTAGE_RETRIES,
  });
