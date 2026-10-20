"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CARRIER_NAMES,
  DeliveryAddressValidationStatus,
  type DeliveryAddressDto,
  type DeliveryAddressValidationDto,
  type DeliveryPlaceDto,
  type ShippingMethod,
} from "@vp-parts-shop/shared";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { useCheckoutDelivery, useSelectedAddress } from "@/hooks/use-checkout-delivery";
import { deliveryAddressPlacesQueryOptions, validateDeliveryAddress } from "@/lib/api/delivery";
import { AddressForm } from "./address-form";
import {
  EMPTY_ADDRESS_FORM,
  addressFormValuesOf,
  formatAddress,
  toDeliveryAddress,
  type AddressFormValues,
} from "./address-form-values";
import { AddressReview, type AddressReviewState } from "./address-review";
import { SelectedAddressCard } from "./selected-address-card";

const NO_PLACES: DeliveryPlaceDto[] = [];

/** What the carrier made of the address last sent, until the customer edits or resends. */
type ValidationOutcome =
  | { kind: "refused" }
  | { kind: "unavailable" }
  | (Extract<AddressReviewState, { kind: "suggestion" }> & {
      suggested: DeliveryAddressDto;
    });

interface AddressPickerProps {
  carrier: ShippingMethod;
}

/** Where the customer enters the door the courier delivers to; the carrier checks it before it counts. */
export function AddressPicker({ carrier }: AddressPickerProps) {
  const placesQuery = useQuery(deliveryAddressPlacesQueryOptions(carrier));
  const selected = useSelectedAddress(carrier);
  const selectAddress = useCheckoutDelivery((state) => state.selectAddress);
  const validation = useMutation({ mutationFn: validateDeliveryAddress });

  const [draft, setDraft] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [outcome, setOutcome] = useState<ValidationOutcome | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  if (placesQuery.isPending) {
    return <AddressPickerSkeleton />;
  }

  if (placesQuery.isError) {
    return (
      <AvailabilityLoadError
        title="В момента не можем да заредим населените места."
        message="Възникна временен проблем. Моля, опитайте отново."
        onRetry={() => void placesQuery.refetch()}
        className="py-6"
      />
    );
  }

  const places = placesQuery.data ?? NO_PLACES;
  const carrierName = CARRIER_NAMES[carrier];

  const accept = (values: AddressFormValues) => {
    selectAddress({
      carrier,
      address: toDeliveryAddress(values),
      label: formatAddress(values),
    });
    setOutcome(null);
    setIsChanging(false);
  };

  const react = (result: DeliveryAddressValidationDto) => {
    if (result.status === DeliveryAddressValidationStatus.VALID) {
      accept(draft);
    } else if (result.status === DeliveryAddressValidationStatus.UNCERTAIN && result.suggested) {
      setOutcome({
        kind: "suggestion",
        typedLabel: formatAddress(draft),
        suggestedLabel: formatAddress(addressFormValuesOf(result.suggested, places)),
        suggested: result.suggested,
      });
    } else {
      setOutcome({ kind: "refused" });
    }
  };

  const submit = () => {
    setOutcome(null);
    validation.mutate(
      { carrier, address: toDeliveryAddress(draft) },
      { onSuccess: react, onError: () => setOutcome({ kind: "unavailable" }) },
    );
  };

  const edit = (values: AddressFormValues) => {
    setDraft(values);
    setOutcome(null);
  };

  const startChanging = () => {
    if (selected) setDraft(addressFormValuesOf(selected.address, places));
    setIsChanging(true);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12.5px] text-ink-3">
        Куриер до <b className="text-ink">вратата</b> · {carrierName}
      </p>

      {selected && !isChanging ? (
        <SelectedAddressCard
          address={selected.label}
          note={selected.address.note}
          carrierName={carrierName}
          onChange={startChanging}
        />
      ) : (
        <AddressForm
          carrier={carrier}
          places={places}
          values={draft}
          onValuesChange={edit}
          onSubmit={submit}
          isSubmitting={validation.isPending}
          isRefused={outcome?.kind === "refused"}
          notice={
            outcome &&
            outcome.kind !== "refused" && (
              <AddressReview
                review={outcome}
                carrierName={carrierName}
                onAcceptSuggestion={() =>
                  outcome.kind === "suggestion" &&
                  accept(addressFormValuesOf(outcome.suggested, places))
                }
                onKeepTyped={() => accept(draft)}
              />
            )
          }
          onCancel={selected ? () => setIsChanging(false) : undefined}
        />
      )}
    </div>
  );
}

function AddressPickerSkeleton() {
  return (
    <div data-testid="address-picker-skeleton" aria-hidden="true" className="flex flex-col gap-2.5">
      <span className="block h-[360px] animate-pulse rounded-lg bg-bg-sunken" />
    </div>
  );
}
