"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import type { CustomerAddressDto } from "@vp-parts-shop/shared";
import {
  EMPTY_ADDRESS_FORM,
  formatAddress,
  toDeliveryAddress,
  type AddressLineValues,
} from "@/components/checkout/delivery/address/address-form-values";
import { customerProfileQueryOptions } from "@/lib/api/customers";
import { CHECKOUT_CARRIER } from "@/lib/checkout/delivery/delivery-methods";
import { useCheckoutDelivery, type SelectedAddress } from "./use-checkout-delivery";
import { useIsHydrated } from "./use-is-hydrated";

/**
 * Starts a signed-in customer's delivery at their profile's address, unless a
 * delivery was already chosen on this device. The quote re-validates it with
 * the carrier, as it does any address — see docs/AUTH.md.
 */
export function useProfileDeliveryDefault(): void {
  const { isSignedIn } = useAuth();
  const isHydrated = useIsHydrated();
  const { data: profile } = useQuery({
    ...customerProfileQueryOptions,
    enabled: isSignedIn === true,
  });
  const hasChosenDelivery = useCheckoutDelivery(
    (state) => state.office !== null || state.address !== null,
  );
  const defaultAddress = profile?.defaultAddress;

  useEffect(() => {
    if (!isHydrated || hasChosenDelivery) return;
    if (defaultAddress?.carrier !== CHECKOUT_CARRIER) return;

    const { setMethod, selectAddress } = useCheckoutDelivery.getState();
    setMethod("courier-address");
    selectAddress(selectedAddressOf(defaultAddress));
  }, [isHydrated, hasChosenDelivery, defaultAddress]);
}

function selectedAddressOf({
  carrier,
  placeId,
  city,
  postCode,
  ...lines
}: CustomerAddressDto): SelectedAddress {
  const values: AddressLineValues = {
    ...EMPTY_ADDRESS_FORM,
    ...lines,
    place: { id: placeId, name: city, postCode },
  };

  return {
    carrier,
    address: toDeliveryAddress(values),
    label: formatAddress(values),
  };
}
