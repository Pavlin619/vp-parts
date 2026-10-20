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
  type PlaceOrderRequestDto,
  type PlaceOrderResponseDto,
} from "@vp-parts-shop/shared";
import { cartQueryOptions } from "@/lib/api/cart";
import { AVAILABILITY_QUERY_KEY } from "@/lib/api/catalog";
import { CHECKOUT_QUERY_KEY, DELIVERY_QUOTE_QUERY_KEY } from "@/lib/api/checkout";
import { customerProfileQueryOptions } from "@/lib/api/customers";
import { placeOrder } from "@/lib/api/orders";
import { CHECKOUT_CARRIER } from "@/lib/checkout/delivery/delivery-methods";
import type { SummaryMoney } from "@/lib/checkout/delivery/delivery-summary";
import {
  isFailureCurrent,
  placeOrderFailureOf,
  placeOrderRequestOf,
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

interface PlaceOrderOptions {
  /** The money the summary shows; its total is the one the order is placed at. */
  money: SummaryMoney | null;
  areLinesOrderable: boolean;
}

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
  retry: [],
};

/**
 * Places the signed-in customer's order at the total checkout shows. The server
 * refuses one that no longer matches, and this re-reads whatever the refusal
 * names — see docs/ORDERS.md → "Refusals and where the customer acts on them".
 */
export function usePlaceOrder({ money, areLinesOrderable }: PlaceOrderOptions): PlaceOrder {
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

  const input: PlaceOrderInput = {
    cartId,
    cartVersion,
    method,
    officeCode,
    address: selectedAddress?.address ?? null,
    paymentMethod,
    money,
    isProfileComplete:
      isSignedIn === true && profile.data !== undefined && isProfileComplete(profile.data),
    areLinesOrderable,
  };
  const request = placeOrderRequestOf(input);

  const mutation = useMutation({
    mutationFn: placeOrder,
    onSuccess: ({ orderReference }) => {
      router.replace(orderPagePath(orderReference));
      forgetCheckout(queryClient);
    },
    onError: (error, sent) => {
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

function currentFailureOf(
  mutation: UseMutationResult<PlaceOrderResponseDto, Error, PlaceOrderRequestDto>,
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
  void queryClient.invalidateQueries({ queryKey: cartQueryOptions.queryKey });
}

function refetchFor(queryClient: QueryClient, failure: PlaceOrderFailure): void {
  for (const queryKey of RECOVERY_QUERY_KEYS[failure.kind]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
