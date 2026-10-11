"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeliveryAddressDto, ShippingMethod } from "@vp-parts-shop/shared";
import {
  DEFAULT_DELIVERY_METHOD,
  type DeliveryMethod,
} from "@/lib/checkout/delivery/delivery-methods";
import { useIsHydrated } from "./use-is-hydrated";

export interface SelectedOffice {
  carrier: ShippingMethod;
  code: string;
}

/** An address the carrier accepted, with the line the customer reads back. */
export interface SelectedAddress {
  carrier: ShippingMethod;
  address: DeliveryAddressDto;
  label: string;
}

interface CheckoutDeliveryState {
  method: DeliveryMethod;
  office: SelectedOffice | null;
  address: SelectedAddress | null;

  setMethod: (method: DeliveryMethod) => void;
  selectOffice: (office: SelectedOffice) => void;
  clearOffice: () => void;
  selectAddress: (address: SelectedAddress) => void;
  /** Forgets every choice — the next person on this device starts fresh. */
  reset: () => void;
}

const INITIAL_DELIVERY = {
  method: DEFAULT_DELIVERY_METHOD,
  office: null,
  address: null,
} satisfies Pick<CheckoutDeliveryState, "method" | "office" | "address">;

/**
 * How the customer wants the order delivered, kept on the device so a reload or
 * a return visit finds it chosen. The API first hears of it with the order,
 * where it is checked again — see docs/DELIVERY-PROVIDERS.md.
 */
export const useCheckoutDelivery = create<CheckoutDeliveryState>()(
  persist(
    (set) => ({
      ...INITIAL_DELIVERY,

      setMethod: (method) => set({ method }),
      selectOffice: (office) => set({ office }),
      clearOffice: () => set({ office: null }),
      selectAddress: (address) => set({ address }),
      reset: () => set(INITIAL_DELIVERY),
    }),
    {
      name: "vp-checkout-delivery",
      partialize: ({ method, office, address }) => ({
        method,
        office,
        address,
      }),
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

/** The remembered address, if it was accepted for this carrier. */
export function useSelectedAddress(carrier: ShippingMethod): SelectedAddress | null {
  const isHydrated = useIsHydrated();
  const address = useCheckoutDelivery((state) => state.address);

  return isHydrated && address?.carrier === carrier ? address : null;
}
