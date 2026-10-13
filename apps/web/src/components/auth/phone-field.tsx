import type { ComponentProps } from "react";
import { TextField } from "@/components/common/text-field";

type PhoneFieldProps = Omit<
  ComponentProps<typeof TextField>,
  "label" | "type" | "inputMode" | "autoComplete" | "placeholder"
> & { label?: string };

export function PhoneField({ label = "Телефон", ...fieldProps }: PhoneFieldProps) {
  return (
    <TextField
      {...fieldProps}
      label={label}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+359 88 123 4567"
    />
  );
}
