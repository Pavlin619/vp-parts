"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DELIVERY_ADDRESS_LIMITS } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import { AddressField } from "./address-field";
import { AddressNoteField } from "./address-note-field";
import { AddressSearch } from "./address-search";
import { addressErrors, type AddressErrors } from "./address-errors";
import type { AddressFormValues } from "./address-form-values";

const LIMITS = DELIVERY_ADDRESS_LIMITS;

type TouchGroup = "city" | "postcode" | "locator";

interface AddressFormProps {
  values: AddressFormValues;
  onValuesChange: (values: AddressFormValues) => void;
  onSubmit: () => void;
  /** Present when there is an address to go back to. */
  onCancel?: () => void;
}

/**
 * Econt wants a street with its number, or a quarter with where in it — either
 * pair locates the door.
 */
export function AddressForm({ values, onValuesChange, onSubmit, onCancel }: AddressFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [touched, setTouched] = useState<ReadonlySet<TouchGroup>>(new Set());
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const errors = addressErrors(values);
  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    if (submitAttempts > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [submitAttempts]);

  const setValue = (field: keyof AddressFormValues) => (value: string) =>
    onValuesChange({ ...values, [field]: value });
  const touch = (group: TouchGroup) => () =>
    setTouched((current) => new Set(current).add(group));
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
      <AddressSearch />

      <div className="my-3.5 flex items-center gap-2.5 text-[11.5px] text-ink-4 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        или попълни ръчно
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AddressField
          label="Населено място"
          value={values.city}
          onValueChange={setValue("city")}
          onBlur={touch("city")}
          error={errorOf("city", "city")}
          autoComplete="address-level2"
          placeholder="София"
        />
        <AddressField
          label="Пощенски код"
          value={values.postcode}
          onValueChange={setValue("postcode")}
          onBlur={touch("postcode")}
          error={errorOf("postcode", "postcode")}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={4}
        />

        <div className="grid grid-cols-[1fr_96px] gap-3 sm:col-span-2">
          <AddressField
            label="Улица / бул."
            value={values.street}
            onValueChange={setValue("street")}
            onBlur={touch("locator")}
            error={errorOf("street", "locator")}
            autoComplete="address-line1"
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

        <p className="text-[11.5px] text-ink-4 sm:col-span-2">
          В жилищен комплекс без улица въведи квартал и блок, вход, етаж или апартамент.
        </p>

        <AddressField
          label="Кв. / ж.к."
          value={values.quarter}
          onValueChange={setValue("quarter")}
          onBlur={touch("locator")}
          maxLength={LIMITS.quarter}
        />
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
          onBlur={touch("locator")}
          placeholder="вх."
          maxLength={LIMITS.entrance}
        />
        <div className="grid grid-cols-2 gap-3">
          <AddressField
            label="Етаж"
            value={values.floor}
            onValueChange={setValue("floor")}
            onBlur={touch("locator")}
            placeholder="ет."
            maxLength={LIMITS.floor}
          />
          <AddressField
            label="Апартамент"
            value={values.apartment}
            onValueChange={setValue("apartment")}
            onBlur={touch("locator")}
            placeholder="ап."
            maxLength={LIMITS.apartment}
          />
        </div>

        <AddressNoteField
          label="Забележка за куриера"
          value={values.note}
          maxLength={LIMITS.note}
          onValueChange={setValue("note")}
          className="sm:col-span-2"
        />
      </div>

      <div className="mt-3.5 flex justify-end gap-2 max-sm:[&>*]:flex-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отказ
          </Button>
        )}
        <Button type="submit">
          Доставяй на този адрес
        </Button>
      </div>
    </form>
  );
}
