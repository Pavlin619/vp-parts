"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DeliveryOfficeDto, DeliveryPlaceDto, ShippingMethod } from "@vp-parts-shop/shared";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { useCart } from "@/hooks/use-cart";
import { useCheckoutDelivery, useSelectedOfficeCode } from "@/hooks/use-checkout-delivery";
import {
  deliveryOfficesQueryOptions,
  deliveryPlacesQueryOptions,
  parcelEstimateQueryOptions,
} from "@/lib/api/delivery";
import { CARRIER_NAMES } from "@/lib/checkout/delivery/delivery-methods";
import { resolveSelectedOffice, type ParcelCheck } from "@/lib/checkout/delivery/office-availability";
import { OfficeBrowser } from "./office-browser";
import { ParcelUnmeasuredNotice } from "./parcel-unmeasured-notice";
import { SelectedOfficeCard } from "./selected-office-card";

const NO_OFFICES: DeliveryOfficeDto[] = [];
const NO_PLACES: DeliveryPlaceDto[] = [];

interface OfficePickerProps {
  carrier: ShippingMethod;
}

/** Where the customer chooses the carrier's office or locker to collect the parcel from. */
export function OfficePicker({ carrier }: OfficePickerProps) {
  const officesQuery = useQuery(deliveryOfficesQueryOptions(carrier));
  const placesQuery = useQuery(deliveryPlacesQueryOptions(carrier));
  const parcelCheck = useParcelCheck(carrier);
  const selectedCode = useSelectedOfficeCode(carrier);
  const selectOffice = useCheckoutDelivery((state) => state.selectOffice);

  const [isChanging, setIsChanging] = useState(false);

  if (officesQuery.isPending || placesQuery.isPending) {
    return <OfficePickerSkeleton />;
  }

  if (officesQuery.isError || placesQuery.isError) {
    return (
      <AvailabilityLoadError
        title="В момента не можем да заредим офисите на куриера."
        message="Възникна временен проблем. Моля, опитайте отново."
        onRetry={() => {
          void officesQuery.refetch();
          void placesQuery.refetch();
        }}
        className="py-6"
      />
    );
  }

  const offices = officesQuery.data ?? NO_OFFICES;
  const places = placesQuery.data ?? NO_PLACES;
  const selectedOffice = resolveSelectedOffice(offices, selectedCode, parcelCheck);
  const isUnmeasured = parcelCheck.state === "ready" && parcelCheck.parcel.weightGrams === null;
  const carrierName = CARRIER_NAMES[carrier];

  const handleChoose = (code: string) => {
    selectOffice({ carrier, code });
    setIsChanging(false);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {isUnmeasured && <ParcelUnmeasuredNotice />}

      {selectedOffice && !isChanging ? (
        <SelectedOfficeCard
          office={selectedOffice}
          carrierName={carrierName}
          onChange={() => setIsChanging(true)}
        />
      ) : (
        <OfficeBrowser
          offices={offices}
          places={places}
          parcelCheck={parcelCheck}
          carrier={carrier}
          chosenCode={selectedCode}
          onChoose={handleChoose}
          onCancel={selectedOffice ? () => setIsChanging(false) : undefined}
        />
      )}
    </div>
  );
}

/** The parcel estimate for the cart version on screen, as the picker reads it. */
function useParcelCheck(carrier: ShippingMethod): ParcelCheck {
  const cartId = useCart((state) => state.cartId);
  const cartVersion = useCart((state) => state.version);
  const { data, isError } = useQuery(parcelEstimateQueryOptions(carrier, cartId, cartVersion));

  return useMemo<ParcelCheck>(() => {
    if (data) {
      return { state: "ready", parcel: data };
    }

    return isError ? { state: "failed" } : { state: "checking" };
  }, [data, isError]);
}

function OfficePickerSkeleton() {
  return (
    <div data-testid="office-picker-skeleton" aria-hidden="true" className="flex flex-col gap-2.5">
      <span className="block h-10 animate-pulse rounded-lg bg-bg-sunken" />
      <span className="block h-[520px] animate-pulse rounded-lg bg-bg-sunken" />
    </div>
  );
}
