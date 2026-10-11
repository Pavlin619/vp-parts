"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { type DeliveryPlaceDto, type ShippingMethod } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import { PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "./address-action-buttons";
import { AddressFields } from "./address-fields";
import { addressErrors } from "./address-errors";
import { locatorModeOf, type AddressFormValues, type LocatorMode } from "./address-form-values";
import { focusFirstInvalidField } from "@/lib/focus-first-invalid-field";

interface AddressFormProps {
  carrier: ShippingMethod;
  places: DeliveryPlaceDto[];
  values: AddressFormValues;
  onValuesChange: (values: AddressFormValues) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  /** The carrier refused the address sent; marks the field that locates the door. */
  isRefused?: boolean;
  /** What the carrier said about the last address sent, shown above the buttons. */
  notice?: ReactNode;
  /** Present when there is an address to go back to. */
  onCancel?: () => void;
}

export function AddressForm({
  carrier,
  places,
  values,
  onValuesChange,
  onSubmit,
  isSubmitting = false,
  isRefused = false,
  notice,
  onCancel,
}: AddressFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [mode, setMode] = useState<LocatorMode>(() => locatorModeOf(values));
  const hasErrors = Object.keys(addressErrors(values, mode)).length > 0;

  useEffect(() => {
    if (submitAttempts > 0 || isRefused) {
      focusFirstInvalidField(formRef.current);
    }
  }, [submitAttempts, isRefused]);

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (hasErrors) {
      setSubmitAttempts((attempts) => attempts + 1);
      return;
    }

    onSubmit();
  };

  return (
    <form
      ref={formRef}
      aria-label="Адрес за доставка"
      noValidate
      onSubmit={submit}
      className="rounded-[10px] border border-line bg-bg-card p-3.5"
    >
      <AddressFields
        carrier={carrier}
        places={places}
        values={values}
        onValuesChange={onValuesChange}
        mode={mode}
        onModeChange={setMode}
        showAllErrors={submitAttempts > 0}
        isRefused={isRefused}
      />

      {notice}

      <div className="mt-3.5 flex justify-end gap-2 max-sm:[&>*]:flex-1">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className={SECONDARY_ACTION_CLASS}
          >
            Отказ
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className={PRIMARY_ACTION_CLASS}>
          {isSubmitting ? "Проверяваме адреса…" : "Доставяй на този адрес"}
        </Button>
      </div>
    </form>
  );
}
