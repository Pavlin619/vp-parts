"use client";

import { useState } from "react";
import {
  DELIVERY_ADDRESS_LIMITS,
  type DeliveryPlaceDto,
  type ShippingMethod,
} from "@vp-parts-shop/shared";
import { TextField } from "@/components/common/text-field";
import { AddressNoteField } from "./address-note-field";
import { PlaceFields } from "../offices/place";
import { useDeliveryNameSuggestions } from "@/hooks/use-delivery-name-suggestions";
import { addressErrors, type AddressErrors } from "./address-errors";
import { withLocatorMode, type AddressFormValues, type LocatorMode } from "./address-form-values";
import { LocatorModeSwitch } from "./locator-mode-switch";

const LIMITS = DELIVERY_ADDRESS_LIMITS;

const REFUSED_MESSAGES: Record<LocatorMode, string> = {
  street: "Невалиден адрес. Провери улицата, номера и населеното място.",
  quarter: "Невалиден адрес. Провери квартала, блока и населеното място.",
};

type TouchGroup = "place" | "locator";

interface AddressFieldsProps {
  carrier: ShippingMethod;
  places: DeliveryPlaceDto[];
  values: AddressFormValues;
  onValuesChange: (values: AddressFormValues) => void;
  mode: LocatorMode;
  onModeChange: (mode: LocatorMode) => void;
  /** Marks every missing field, not only those left — set once a submit was refused. */
  showAllErrors: boolean;
  /** The carrier refused the address sent; marks the field that locates the door. */
  isRefused?: boolean;
}

/**
 * Econt wants a street with its number, or a quarter with where in it — either
 * pair locates the door. The surrounding form decides what submitting means.
 */
export function AddressFields({
  carrier,
  places,
  values,
  onValuesChange,
  mode,
  onModeChange,
  showAllErrors,
  isRefused = false,
}: AddressFieldsProps) {
  const [touched, setTouched] = useState<ReadonlySet<TouchGroup>>(new Set());
  const [region, setRegion] = useState<string | null>(null);
  const placeId = values.place?.id ?? null;
  const streetNames = useDeliveryNameSuggestions("streets", carrier, placeId, values.street);
  const quarterNames = useDeliveryNameSuggestions("quarters", carrier, placeId, values.quarter);
  const errors = addressErrors(values, mode);
  const locatorError = isRefused ? REFUSED_MESSAGES[mode] : undefined;

  const changeMode = (next: LocatorMode) => {
    if (next === mode) return;

    onModeChange(next);
    onValuesChange(withLocatorMode(values));
  };
  const setValue = (field: keyof AddressFormValues) => (value: string) =>
    onValuesChange({ ...values, [field]: value });
  const touch = (group: TouchGroup) => () => setTouched((current) => new Set(current).add(group));
  const errorOf = (field: keyof AddressErrors, group: TouchGroup) =>
    showAllErrors || touched.has(group) ? errors[field] : undefined;

  return (
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
          <TextField
            label="Улица / бул."
            value={values.street}
            onValueChange={setValue("street")}
            onBlur={touch("locator")}
            error={locatorError ?? errorOf("street", "locator")}
            autoComplete="address-line1"
            suggestions={streetNames}
            maxLength={LIMITS.street}
          />
          <TextField
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
        <TextField
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
        <TextField
          label="Блок"
          value={values.block}
          onValueChange={setValue("block")}
          onBlur={touch("locator")}
          error={errorOf("block", "locator")}
          placeholder="бл."
          maxLength={LIMITS.block}
        />
        <TextField
          label="Вход"
          value={values.entrance}
          onValueChange={setValue("entrance")}
          placeholder="вх."
          maxLength={LIMITS.entrance}
        />
        <TextField
          label="Етаж"
          value={values.floor}
          onValueChange={setValue("floor")}
          placeholder="ет."
          maxLength={LIMITS.floor}
        />
        <TextField
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
  );
}
