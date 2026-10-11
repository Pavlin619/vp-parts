import type { ComponentProps } from "react";
import { AddressField } from "@/components/checkout/delivery/address/address-field";

type PhoneFieldProps = Omit<
  ComponentProps<typeof AddressField>,
  "label" | "type" | "inputMode" | "autoComplete" | "placeholder"
> & { label?: string };

export function PhoneField({ label = "Телефон", ...fieldProps }: PhoneFieldProps) {
  return (
    <AddressField
      {...fieldProps}
      label={label}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+359 88 123 4567"
    />
  );
}
