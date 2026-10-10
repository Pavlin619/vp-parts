"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  DELIVERY_ADDRESS_LIMITS,
  type DeliveryPlaceDto,
  type ShippingMethod,
} from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import { PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "./address-action-buttons";
import { AddressField } from "./address-field";
import { AddressNoteField } from "./address-note-field";
import { PlaceFields } from "../offices/place";
import { useDeliveryNameSuggestions } from "@/hooks/use-delivery-name-suggestions";
import { addressErrors, type AddressErrors } from "./address-errors";
import {
  locatorModeOf,
  withLocatorMode,
  type AddressFormValues,
  type LocatorMode,
} from "./address-form-values";
import { LocatorModeSwitch } from "./locator-mode-switch";

const LIMITS = DELIVERY_ADDRESS_LIMITS;

const REFUSED_MESSAGES: Record<LocatorMode, string> = {
  street: "Невалиден адрес. Провери улицата, номера и населеното място.",
  quarter: "Невалиден адрес. Провери квартала, блока и населеното място.",
};

type TouchGroup = "place" | "locator";

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

/**
 * Econt wants a street with its number, or a quarter with where in it — either
 * pair locates the door.
 */
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
  const [touched, setTouched] = useState<ReadonlySet<TouchGroup>>(new Set());
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [region, setRegion] = useState<string | null>(null);
  const placeId = values.place?.id ?? null;
  const streetNames = useDeliveryNameSuggestions("streets", carrier, placeId, values.street);
  const quarterNames = useDeliveryNameSuggestions("quarters", carrier, placeId, values.quarter);
  const [mode, setMode] = useState<LocatorMode>(() => locatorModeOf(values));
  const errors = addressErrors(values, mode);
  const locatorError = isRefused ? REFUSED_MESSAGES[mode] : undefined;
  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    if (submitAttempts > 0 || locatorError) {
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] input')
        ?.focus();
    }
  }, [submitAttempts, locatorError]);

  const changeMode = (next: LocatorMode) => {
    if (next === mode) return;

    setMode(next);
    onValuesChange(withLocatorMode(values));
  };
  const setValue = (field: keyof AddressFormValues) => (value: string) =>
    onValuesChange({ ...values, [field]: value });
  const touch = (group: TouchGroup) => () => setTouched((current) => new Set(current).add(group));
  const errorOf = (field: keyof AddressErrors, group: TouchGroup) =>
    submitAttempts > 0 || touched.has(group) ? errors[field] : undefined;

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          data-invalid={errorOf("place", "place") ? true : undefined}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) touch("place")();
          }}
          className="flex flex-col gap-[5px] sm:col-span-2"
        >
          <PlaceFields
            places={places}
            region={region}
            place={values.place}
            onRegionChange={setRegion}
            onPlaceChange={(place) => onValuesChange({ ...values, place })}
          />
          {errorOf("place", "place") && (
            <span className="text-[11.5px] text-danger">{errorOf("place", "place")}</span>
          )}
        </div>

        <LocatorModeSwitch mode={mode} onChange={changeMode} />

        {mode === "street" ? (
          <div className="grid grid-cols-[1fr_96px] gap-3 sm:col-span-2">
            <AddressField
              label="Улица / бул."
              value={values.street}
              onValueChange={setValue("street")}
              onBlur={touch("locator")}
              error={locatorError ?? errorOf("street", "locator")}
              autoComplete="address-line1"
              suggestions={streetNames}
              maxLength={LIMITS.street}
            />
            <AddressField
              label="Номер"
              value={values.streetNumber}
              onValueChange={setValue("streetNumber")}
              onBlur={touch("locator")}
              error={errorOf("streetNumber", "locator")}
              placeholder="№"
              maxLength={LIMITS.streetNumber}
            />
          </div>
        ) : (
          <AddressField
            label="Кв. / ж.к."
            value={values.quarter}
            onValueChange={setValue("quarter")}
            onBlur={touch("locator")}
            error={locatorError ?? errorOf("quarter", "locator")}
            suggestions={quarterNames}
            maxLength={LIMITS.quarter}
            className="sm:col-span-2"
          />
        )}

        <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
          <AddressField
            label="Блок"
            value={values.block}
            onValueChange={setValue("block")}
            onBlur={touch("locator")}
            error={errorOf("block", "locator")}
            placeholder="бл."
            maxLength={LIMITS.block}
          />
          <AddressField
            label="Вход"
            value={values.entrance}
            onValueChange={setValue("entrance")}
            placeholder="вх."
            maxLength={LIMITS.entrance}
          />
          <AddressField
            label="Етаж"
            value={values.floor}
            onValueChange={setValue("floor")}
            placeholder="ет."
            maxLength={LIMITS.floor}
          />
          <AddressField
            label="Апартамент"
            value={values.apartment}
            onValueChange={setValue("apartment")}
            placeholder="ап."
            maxLength={LIMITS.apartment}
          />
        </div>

        {mode === "quarter" && (
          <p className="text-[11.5px] text-ink-4 sm:col-span-2">
            Без улица са нужни блок, вход, етаж или апартамент — поне едно от тях.
          </p>
        )}

        <AddressNoteField
          label="Забележка за куриера"
          value={values.note}
          maxLength={LIMITS.note}
          onValueChange={setValue("note")}
          className="sm:col-span-2"
        />
      </div>

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
