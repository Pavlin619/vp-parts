import { queryOptions } from "@tanstack/react-query";
import type {
  OrderDetailDto,
  PlaceOrderRequestDto,
  PlaceOrderResponseDto,
} from "@vp-parts-shop/shared";
import { apiFetch, isRefusal } from "./index";

const MAX_ORDER_OUTAGE_RETRIES = 2;

/** Safe to repeat: the cart is the key, so a retry answers with the order already placed. */
export function placeOrder(request: PlaceOrderRequestDto): Promise<PlaceOrderResponseDto> {
  return apiFetch("/orders", { method: "POST", body: request, withSession: true });
}

export function getOrder(orderReference: string): Promise<OrderDetailDto> {
  return apiFetch(`/orders/${encodeURIComponent(orderReference)}`, { withSession: true });
}

export const orderQueryOptions = (orderReference: string) =>
  queryOptions({
    queryKey: ["orders", "order", orderReference] as const,
    queryFn: () => getOrder(orderReference),
    retry: (failureCount: number, error: Error) =>
      !isRefusal(error) && failureCount < MAX_ORDER_OUTAGE_RETRIES,
  });
