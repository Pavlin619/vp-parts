"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ShippingMethod } from "@vp-parts-shop/shared";
import {
  DEFAULT_DELIVERY_METHOD,
  type DeliveryMethod,
} from "@/lib/checkout/delivery/delivery-methods";
import { useIsHydrated } from "./use-is-hydrated";

export interface SelectedOffice {
  carrier: ShippingMethod;
  code: string;
}

interface CheckoutDeliveryState {
  method: DeliveryMethod;
  office: SelectedOffice | null;

  setMethod: (method: DeliveryMethod) => void;
  selectOffice: (office: SelectedOffice) => void;
  clearOffice: () => void;
}

/**
 * How the customer wants the order delivered, kept on the device so a reload or
 * a return visit finds it chosen. The API first hears of it with the order,
 * where it is checked again — see docs/DELIVERY-PROVIDERS.md.
 */
export const useCheckoutDelivery = create<CheckoutDeliveryState>()(
  persist(
    (set) => ({
      method: DEFAULT_DELIVERY_METHOD,
      office: null,

      setMethod: (method) => set({ method }),
      selectOffice: (office) => set({ office }),
      clearOffice: () => set({ office: null }),
    }),
    {
      name: "vp-checkout-delivery",
      partialize: ({ method, office }) => ({ method, office }),
    },
  ),
);

export function useDeliveryMethod(): DeliveryMethod {
  const isHydrated = useIsHydrated();
  const method = useCheckoutDelivery((state) => state.method);

  return isHydrated ? method : DEFAULT_DELIVERY_METHOD;
}

/** The remembered office's code, if it was chosen for this carrier. */
export function useSelectedOfficeCode(carrier: ShippingMethod): string | null {
  const isHydrated = useIsHydrated();
  const office = useCheckoutDelivery((state) => state.office);

  return isHydrated && office?.carrier === carrier ? office.code : null;
}
