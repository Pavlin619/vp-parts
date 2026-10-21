"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  isProfileComplete,
  orderPagePath,
  PaymentMethod,
  type PlaceOrderRequestDto,
  type PlaceOrderResponseDto,
  type QuickOrderRequestDto,
  type QuickOrderResponseDto,
} from "@vp-parts-shop/shared";
import { cartQueryOptions } from "@/lib/api/cart";
import { AVAILABILITY_QUERY_KEY } from "@/lib/api/catalog";
import { CHECKOUT_QUERY_KEY, DELIVERY_QUOTE_QUERY_KEY } from "@/lib/api/checkout";
import { customerProfileQueryOptions } from "@/lib/api/customers";
import { placeOrder, placeQuickOrder } from "@/lib/api/orders";
import { validateQuickOrderContact } from "@/lib/checkout/contact/quick-order-contact";
import { CHECKOUT_CARRIER } from "@/lib/checkout/delivery/delivery-methods";
import type { SummaryMoney } from "@/lib/checkout/delivery/delivery-summary";
import {
  isFailureCurrent,
  placeOrderFailureOf,
  placeOrderRequestOf,
  quickOrderRequestOf,
  type PlaceOrderFailure,
  type PlaceOrderInput,
} from "@/lib/checkout/place-order";
import { useCart } from "./use-cart";
import {
  useCheckoutDelivery,
  useDeliveryMethod,
  useSelectedAddress,
  useSelectedOfficeCode,
} from "./use-checkout-delivery";
import { useCheckoutPayment, usePaymentMethod } from "./use-checkout-payment";
import { useQuickOrder } from "./use-quick-order";

interface PlaceOrderOptions {
  /** The money the summary shows; its total is the one the order is placed at. */
  money: SummaryMoney | null;
  areLinesOrderable: boolean;
  /** A signed-out visitor ordering with a name and a phone; it is paid on delivery. */
  isQuickOrder: boolean;
}

type OrderRequest = PlaceOrderRequestDto | QuickOrderRequestDto;

type OrderResponse = PlaceOrderResponseDto | QuickOrderResponseDto;

export interface PlaceOrder {
  canPlace: boolean;
  isPlacing: boolean;
  /** The order went through and the confirmation page is on its way. */
  isPlaced: boolean;
  failure: PlaceOrderFailure | null;
  place: () => void;
}

/** What each refusal re-reads, so checkout shows the customer what to act on. */
const RECOVERY_QUERY_KEYS: Record<PlaceOrderFailure["kind"], readonly (readonly unknown[])[]> = {
  "price-changed": [AVAILABILITY_QUERY_KEY, CHECKOUT_QUERY_KEY],
  "cart-stale": [cartQueryOptions.queryKey, CHECKOUT_QUERY_KEY],
  unavailable: [AVAILABILITY_QUERY_KEY, CHECKOUT_QUERY_KEY],
  "details-required": [customerProfileQueryOptions.queryKey],
  delivery: [DELIVERY_QUOTE_QUERY_KEY],
  "rate-limited": [],
  "bot-check": [],
  retry: [],
};

/**
 * Places the order at the total checkout shows: the signed-in customer's, or a
 * guest's quick order. The server refuses one that no longer matches, and this
 * re-reads whatever the refusal names — see docs/ORDERS.md → "Refusals and
 * where the customer acts on them".
 */
export function usePlaceOrder({
  money,
  areLinesOrderable,
  isQuickOrder,
}: PlaceOrderOptions): PlaceOrder {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const profile = useQuery({ ...customerProfileQueryOptions, enabled: isSignedIn === true });
  const cartId = useCart((state) => state.cartId);
  const cartVersion = useCart((state) => state.version);
  const method = useDeliveryMethod();
  const officeCode = useSelectedOfficeCode(CHECKOUT_CARRIER);
  const selectedAddress = useSelectedAddress(CHECKOUT_CARRIER);
  const paymentMethod = usePaymentMethod();
  const guestContact = validateQuickOrderContact(useQuickOrder((state) => state.contact));
  const botCheckToken = useQuickOrder((state) => state.botCheck.token);

  const input: PlaceOrderInput = {
    cartId,
    cartVersion,
    method,
    officeCode,
    address: selectedAddress?.address ?? null,
    paymentMethod: isQuickOrder ? PaymentMethod.CASH_ON_DELIVERY : paymentMethod,
    money,
    isContactComplete: isQuickOrder
      ? guestContact.success
      : isSignedIn === true && profile.data !== undefined && isProfileComplete(profile.data),
    areLinesOrderable,
  };
  const order = placeOrderRequestOf(input);
  const request: OrderRequest | null = isQuickOrder
    ? quickOrderRequestOf(order, {
        contact: guestContact.success ? guestContact.data : null,
        botCheckToken,
      })
    : order;

  const mutation = useMutation({
    mutationFn: submitOrder,
    onSuccess: (placed) => {
      router.replace(orderPagePath(placed.orderReference, accessKeyOf(placed)));
      forgetCheckout(queryClient);
    },
    onError: (error, sent) => {
      if (isQuickOrderRequest(sent)) {
        useQuickOrder.getState().spendBotCheck();
      }
      refetchFor(queryClient, placeOrderFailureOf(error, sent));
    },
  });

  const isBusy = mutation.isPending || mutation.isSuccess;

  return {
    canPlace: request !== null && !isBusy,
    isPlacing: mutation.isPending,
    isPlaced: mutation.isSuccess,
    failure: currentFailureOf(mutation, input),
    place: () => {
      if (request !== null && !isBusy) {
        mutation.mutate(request);
      }
    },
  };
}

function submitOrder(request: OrderRequest): Promise<OrderResponse> {
  return isQuickOrderRequest(request) ? placeQuickOrder(request) : placeOrder(request);
}

function isQuickOrderRequest(request: OrderRequest): request is QuickOrderRequestDto {
  return "contact" in request;
}

/** Only a guest's order is answered with a key; a customer reads theirs through the account. */
function accessKeyOf(placed: OrderResponse): string | undefined {
  return "accessKey" in placed ? placed.accessKey : undefined;
}

function currentFailureOf(
  mutation: UseMutationResult<OrderResponse, Error, OrderRequest>,
  input: PlaceOrderInput,
): PlaceOrderFailure | null {
  const sent = mutation.variables;

  if (!mutation.isError || !sent) {
    return null;
  }

  const failure = placeOrderFailureOf(mutation.error, sent);

  return isFailureCurrent(failure, sent, input) ? failure : null;
}

/** The cart now holds only the lines left unselected, and the next order starts fresh. */
function forgetCheckout(queryClient: QueryClient): void {
  useCheckoutDelivery.getState().reset();
  useCheckoutPayment.getState().reset();
  useQuickOrder.getState().reset();
  void queryClient.invalidateQueries({ queryKey: cartQueryOptions.queryKey });
}

function refetchFor(queryClient: QueryClient, failure: PlaceOrderFailure): void {
  for (const queryKey of RECOVERY_QUERY_KEYS[failure.kind]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
