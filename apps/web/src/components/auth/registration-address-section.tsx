"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import type { ShippingMethod } from "@vp-parts-shop/shared";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { AddressFields } from "@/components/checkout/delivery/address/address-fields";
import type {
  AddressFormValues,
  LocatorMode,
} from "@/components/checkout/delivery/address/address-form-values";
import { deliveryAddressPlacesQueryOptions } from "@/lib/api/delivery";

interface RegistrationAddressSectionProps {
  carrier: ShippingMethod;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  values: AddressFormValues;
  onValuesChange: (values: AddressFormValues) => void;
  mode: LocatorMode;
  onModeChange: (mode: LocatorMode) => void;
  showAllErrors: boolean;
}

/** The optional address a new profile starts with; closed, none is sent. */
export function RegistrationAddressSection({
  carrier,
  isOpen,
  onOpenChange,
  ...fieldsProps
}: RegistrationAddressSectionProps) {
  if (!isOpen) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => onOpenChange(true)}
        className="flex items-center justify-between gap-2 rounded-[10px] border border-dashed border-line-2 px-3.5 py-3 text-left text-[13px] font-semibold text-ink-2 hover:bg-bg-sunken"
      >
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-ink-3" aria-hidden="true" />
          Добави адрес за доставка
        </span>
        <span className="text-[12px] font-medium text-ink-4">по желание</span>
      </button>
    );
  }

  return (
    <section
      aria-label="Адрес за доставка"
      className="flex flex-col gap-3 rounded-[10px] border border-line p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-3">Ще го предложим при следващата поръчка.</p>
        <button
          type="button"
          aria-expanded
          onClick={() => onOpenChange(false)}
          className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-ink-3 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Без адрес
        </button>
      </div>

      <RegistrationAddressFields carrier={carrier} {...fieldsProps} />
    </section>
  );
}

type RegistrationAddressFieldsProps = Omit<
  RegistrationAddressSectionProps,
  "isOpen" | "onOpenChange"
>;

function RegistrationAddressFields({ carrier, ...fieldsProps }: RegistrationAddressFieldsProps) {
  const placesQuery = useQuery(deliveryAddressPlacesQueryOptions(carrier));

  if (placesQuery.isPending) {
    return (
      <span
        data-testid="registration-address-skeleton"
        aria-hidden="true"
        className="block h-[300px] animate-pulse rounded-lg bg-bg-sunken"
      />
    );
  }

  if (placesQuery.isError) {
    return (
      <AvailabilityLoadError
        title="В момента не можем да заредим населените места."
        message="Опитайте отново или добавете адреса при поръчка."
        onRetry={() => void placesQuery.refetch()}
        className="py-6"
      />
    );
  }

  return <AddressFields carrier={carrier} places={placesQuery.data} {...fieldsProps} />;
}
