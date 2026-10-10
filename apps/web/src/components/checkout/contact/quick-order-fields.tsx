"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { contactNameError, contactPhoneError } from "@/lib/checkout/contact/contact-modes";
import { AddressField } from "../delivery/address/address-field";

type QuickOrderField = "name" | "phone";

/** The name and phone a quick order is placed with; each is checked once left. */
export function QuickOrderFields() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState<Record<QuickOrderField, boolean>>({
    name: false,
    phone: false,
  });

  const markTouched = (field: QuickOrderField) => () =>
    setTouched((current) => ({ ...current, [field]: true }));

  return (
    <>
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <AddressField
          label="Име и фамилия"
          autoComplete="name"
          value={name}
          onValueChange={setName}
          onBlur={markTouched("name")}
          error={touched.name ? contactNameError(name) : undefined}
        />
        <AddressField
          label="Телефон"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+359 88 123 4567"
          value={phone}
          onValueChange={setPhone}
          onBlur={markTouched("phone")}
          error={touched.phone ? contactPhoneError(phone) : undefined}
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
