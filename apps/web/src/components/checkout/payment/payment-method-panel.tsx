"use client";

import { useId, type ReactNode } from "react";
import { Banknote, CreditCard } from "lucide-react";
import { PaymentMethod } from "@vp-parts-shop/shared";
import { B2C_PAYMENT_METHODS } from "@/lib/checkout/payment/payment-methods";
import { DeliveryOptionCard } from "../delivery";

const METHOD_ICONS: Record<PaymentMethod, ReactNode> = {
  [PaymentMethod.CARD]: <CreditCard />,
  [PaymentMethod.CASH_ON_DELIVERY]: <Banknote />,
};

const COMING_SOON = (
  <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-bg-sunken px-2 text-[11px] font-semibold text-ink-3">
    Очаквайте скоро
  </span>
);

interface PaymentMethodPanelProps {
  method: PaymentMethod | null;
  onMethodChange: (method: PaymentMethod) => void;
}

export function PaymentMethodPanel({ method, onMethodChange }: PaymentMethodPanelProps) {
  const titleId = useId();

  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2
        id={titleId}
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
      >
        Метод на плащане
      </h2>

      <div role="radiogroup" aria-labelledby={titleId} className="flex flex-col gap-2">
        {B2C_PAYMENT_METHODS.map((option) => (
          <DeliveryOptionCard
            key={option.id}
            name="payment-method"
            value={option.id}
            label={option.label}
            description={option.description}
            icon={METHOD_ICONS[option.id]}
            trailing={option.isAvailable ? undefined : COMING_SOON}
            // A method remembered from before it was withdrawn is not a choice made.
            isSelected={option.isAvailable && method === option.id}
            isDisabled={!option.isAvailable}
            onSelect={() => onMethodChange(option.id)}
          />
        ))}
      </div>
    </section>
  );
}
