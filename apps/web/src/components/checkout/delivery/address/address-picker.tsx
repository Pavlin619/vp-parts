"use client";

import { useState } from "react";
import { ShippingMethod } from "@vp-parts-shop/shared";
import { CARRIER_NAMES } from "@/lib/checkout/delivery/delivery-methods";
import { AddressForm } from "./address-form";
import {
  EMPTY_ADDRESS_FORM,
  formatAddress,
  type AddressFormValues,
} from "./address-form-values";
import { SelectedAddressCard } from "./selected-address-card";

interface AddressPickerProps {
  carrier: ShippingMethod;
}

/** Where the customer enters the door the courier delivers to, and confirms it. */
export function AddressPicker({ carrier }: AddressPickerProps) {
  const [draft, setDraft] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [confirmed, setConfirmed] = useState<AddressFormValues | null>(null);
  const [isEditing, setIsEditing] = useState(true);

  const confirm = () => {
    setConfirmed(draft);
    setIsEditing(false);
  };

  const cancel = () => {
    if (confirmed) setDraft(confirmed);
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12.5px] text-ink-3">
        Куриер до <b className="text-ink">вратата</b> · {CARRIER_NAMES[carrier]}
      </p>

      {confirmed && !isEditing ? (
        <SelectedAddressCard
          address={formatAddress(confirmed)}
          note={confirmed.note.trim()}
          carrierName={CARRIER_NAMES[carrier]}
          onChange={() => setIsEditing(true)}
        />
      ) : (
        <AddressForm
          values={draft}
          onValuesChange={setDraft}
          onSubmit={confirm}
          onCancel={confirmed ? cancel : undefined}
        />
      )}
    </div>
  );
}
