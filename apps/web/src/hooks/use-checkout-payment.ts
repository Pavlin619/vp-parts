"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PaymentMethod } from "@vp-parts-shop/shared";
import { useIsHydrated } from "./use-is-hydrated";

interface CheckoutPaymentState {
  /** Null until the customer picks one; checkout preselects nothing. */
  method: PaymentMethod | null;

  setMethod: (method: PaymentMethod) => void;
  /** Forgets the choice — the next person on this device starts fresh. */
  reset: () => void;
}

/** How the customer wants to pay, kept on the device beside the delivery choice. */
export const useCheckoutPayment = create<CheckoutPaymentState>()(
  persist(
    (set) => ({
      method: null,

      setMethod: (method) => set({ method }),
      reset: () => set({ method: null }),
    }),
    {
      name: "vp-checkout-payment",
      partialize: ({ method }) => ({ method }),
    },
  ),
);

export function usePaymentMethod(): PaymentMethod | null {
  const isHydrated = useIsHydrated();
  const method = useCheckoutPayment((state) => state.method);

  return isHydrated ? method : null;
}
