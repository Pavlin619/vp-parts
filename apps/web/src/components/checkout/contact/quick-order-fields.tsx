"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { PhoneField } from "@/components/auth/phone-field";
import { TextField } from "@/components/common/text-field";
import { useQuickOrder } from "@/hooks/use-quick-order";
import {
  validateQuickOrderContact,
  type QuickOrderContactField,
} from "@/lib/checkout/contact/quick-order-contact";

/**
 * Who a quick order is for: both names, as the courier's receiver needs them, a
 * mobile the office calls to confirm, and an optional email. Each field is
 * checked once left; the order button reads them from `useQuickOrder`.
 */
export function QuickOrderFields() {
  const contact = useQuickOrder((state) => state.contact);
  const setContactField = useQuickOrder((state) => state.setContactField);
  const [touched, setTouched] = useState<ReadonlySet<QuickOrderContactField>>(new Set());

  const validation = validateQuickOrderContact(contact);
  const errors = validation.success ? {} : validation.errors;

  const fieldProps = (field: QuickOrderContactField) => ({
    value: contact[field],
    onValueChange: (value: string) => setContactField(field, value),
    onBlur: () => setTouched((current) => new Set(current).add(field)),
    error: touched.has(field) ? errors[field] : undefined,
  });

  return (
    <>
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <TextField label="Име" autoComplete="given-name" {...fieldProps("firstName")} />
        <TextField label="Фамилия" autoComplete="family-name" {...fieldProps("lastName")} />
        <PhoneField {...fieldProps("phoneNumber")} />
        <TextField
          label="Имейл (по избор)"
          type="email"
          autoComplete="email"
          {...fieldProps("email")}
        />
      </div>

      <p className="mt-3.5 flex items-start gap-2.5 rounded-[10px] bg-accent-soft px-3.5 py-3 text-[12.5px] leading-normal text-ink-2">
        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent-hover" aria-hidden="true" />
        <span>
          <b className="font-semibold text-ink">Ще ви се обадим</b>, за да потвърдим поръчката.
          Плащането е при доставка.
        </span>
      </p>
    </>
  );
}
