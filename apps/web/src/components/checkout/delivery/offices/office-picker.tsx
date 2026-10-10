"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DeliveryOfficeDto, DeliveryPlaceDto, ShippingMethod } from "@vp-parts-shop/shared";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { useCheckoutDelivery, useSelectedOfficeCode } from "@/hooks/use-checkout-delivery";
import { useParcelCheck } from "@/hooks/use-parcel-check";
import { approximateLocationQueryOptions } from "@/lib/api/approximate-location";
import {
  deliveryOfficesQueryOptions,
  deliveryPlacesQueryOptions,
} from "@/lib/api/delivery";
import { CARRIER_NAMES } from "@/lib/checkout/delivery/delivery-methods";
import { resolveSelectedOffice } from "@/lib/checkout/delivery/office-availability";
import { OfficeBrowser } from "./office-browser";
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
  const locationQuery = useQuery(approximateLocationQueryOptions);
  const parcelCheck = useParcelCheck(carrier);
  const selectedCode = useSelectedOfficeCode(carrier);
  const selectOffice = useCheckoutDelivery((state) => state.selectOffice);

  const [isChanging, setIsChanging] = useState(false);

  // The location never fails, and the browser takes it only when it mounts.
  if (officesQuery.isPending || placesQuery.isPending || locationQuery.isPending) {
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
  const carrierName = CARRIER_NAMES[carrier];

  const handleChoose = (code: string) => {
    selectOffice({ carrier, code });
    setIsChanging(false);
  };

  return (
    <div className="flex flex-col gap-2.5">
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
          approximateLocation={locationQuery.data ?? null}
          onChoose={handleChoose}
          onCancel={selectedOffice ? () => setIsChanging(false) : undefined}
        />
      )}
    </div>
  );
}

function OfficePickerSkeleton() {
  return (
    <div data-testid="office-picker-skeleton" aria-hidden="true" className="flex flex-col gap-2.5">
      <span className="block h-10 animate-pulse rounded-lg bg-bg-sunken" />
      <span className="block h-[520px] animate-pulse rounded-lg bg-bg-sunken" />
    </div>
  );
}
