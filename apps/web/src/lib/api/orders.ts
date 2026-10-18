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

export function getOrder(orderId: string): Promise<OrderDetailDto> {
  return apiFetch(`/orders/${encodeURIComponent(orderId)}`, { withSession: true });
}

export const orderQueryOptions = (orderId: string) =>
  queryOptions({
    queryKey: ["orders", "order", orderId] as const,
    queryFn: () => getOrder(orderId),
    retry: (failureCount: number, error: Error) =>
      !isRefusal(error) && failureCount < MAX_ORDER_OUTAGE_RETRIES,
  });
