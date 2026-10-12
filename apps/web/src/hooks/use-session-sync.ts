"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  adoptCart,
  cartQueryOptions,
  clearCartToken,
  getCart,
  readCartToken,
} from "@/lib/api/cart";
import {
  customerProfileQueryOptions,
  fileCustomer,
  isCustomerNotFiled,
  isCustomerUnfileable,
  isPhoneRequired,
} from "@/lib/api/customers";
import { useAccountSetupStore, type AccountSetupStall } from "./use-account-setup";
import { useCart } from "./use-cart";
import { useCheckoutDelivery } from "./use-checkout-delivery";

/**
 * Brings what this device holds into line with who is signed in.
 *
 * Driven by the session's state rather than by sign-in and sign-out events, so
 * a reload, a sign-out in another tab and an expired session all land here the
 * same way. See docs/AUTH.md and docs/CART.md.
 */
export function useSessionSync(): void {
  const { isLoaded, userId } = useAuth();
  const queryClient = useQueryClient();
  const attempt = useAccountSetupStore((state) => state.attempt);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const ownerId = useCart.getState().ownerId;

    if (ownerId !== null && ownerId !== userId) {
      forgetSession(queryClient);
    }

    if (!userId) {
      return;
    }

    const session = new AbortController();

    joinSession(queryClient, userId, session.signal).catch((error: unknown) => {
      const accountSetup = describeStall(error);

      if (!session.signal.aborted && accountSetup) {
        useAccountSetupStore.getState().report(userId, accountSetup);
      }
    });

    return () => session.abort();
  }, [isLoaded, userId, queryClient, attempt]);
}

async function joinSession(
  queryClient: QueryClient,
  userId: string,
  signal: AbortSignal,
): Promise<void> {
  await ensureCustomer(queryClient);

  if (signal.aborted) {
    return;
  }

  if (readCartToken()) {
    await claimGuestCart(queryClient, userId, signal);
  } else if (useCart.getState().ownerId !== userId) {
    await loadAccountCart(queryClient, userId, signal);
  }
}

/** Reads the profile, and files the customer when the API has none yet. */
async function ensureCustomer(queryClient: QueryClient): Promise<void> {
  try {
    await queryClient.fetchQuery(customerProfileQueryOptions);
  } catch (error) {
    if (!isCustomerNotFiled(error)) {
      throw error;
    }

    queryClient.setQueryData(customerProfileQueryOptions.queryKey, await fileCustomer());
  }
}

/** Unites the cart this device filled as a guest with the account's. */
async function claimGuestCart(
  queryClient: QueryClient,
  userId: string,
  signal: AbortSignal,
): Promise<void> {
  await useCart.getState().whenSettled();

  const merge = await adoptCart();

  // The server has retired the guest cart whether or not we still show it.
  clearCartToken();

  if (signal.aborted) {
    return;
  }

  useCart.getState().adoptMergedCart(merge, userId);
  queryClient.setQueryData(cartQueryOptions.queryKey, merge.cart);
}

async function loadAccountCart(
  queryClient: QueryClient,
  userId: string,
  signal: AbortSignal,
): Promise<void> {
  const cart = await getCart();

  if (signal.aborted) {
    return;
  }

  useCart.getState().adoptServerCart(cart, userId);
  queryClient.setQueryData(cartQueryOptions.queryKey, cart);
}

/** Clears everything the previous customer left on this device. */
function forgetSession(queryClient: QueryClient): void {
  useCart.getState().reset();
  useCheckoutDelivery.getState().reset();
  queryClient.removeQueries({ queryKey: customerProfileQueryOptions.queryKey });
  // Reset rather than removed: the mounted cart read then fetches the guest's
  // answer, where a removed query would keep handing its observer the old cart.
  void queryClient.resetQueries({ queryKey: cartQueryOptions.queryKey });
}

/** What the customer must be shown, or null for a failure the next load retries. */
function describeStall(error: unknown): AccountSetupStall | null {
  if (isPhoneRequired(error)) {
    return "phone-required";
  }

  return isCustomerUnfileable(error) ? "failed" : null;
}
