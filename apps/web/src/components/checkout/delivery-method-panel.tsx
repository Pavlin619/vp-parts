"use client";

import type { ReactNode } from "react";
import { MapPin, Truck } from "lucide-react";
import { DeliveryCutoffPromise } from "@/components/delivery";
import {
  B2C_DELIVERY_METHODS,
  type DeliveryMethod,
} from "@/lib/checkout/delivery-methods";
import type { DeliveryPromise } from "@/lib/delivery/promise";
import { DeliveryOptionCard } from "./delivery-option-card";

const METHOD_ICONS: Record<DeliveryMethod, ReactNode> = {
  "courier-address": <Truck />,
  "courier-office": <MapPin />,
};

const PROVIDER_SLOT_COPY: Record<DeliveryMethod, string> = {
  "courier-address": "Тук ще въведете адреса за доставка.",
  "courier-office": "Тук ще изберете офис или автомат на куриера.",
};

const TITLE_ID = "delivery-method-title";

interface DeliveryMethodPanelProps {
  method: DeliveryMethod;
  onMethodChange: (method: DeliveryMethod) => void;
  /** The courier deadline the order is racing; null when there is none. */
  promise: DeliveryPromise | null;
}

export function DeliveryMethodPanel({
  method,
  onMethodChange,
  promise,
}: DeliveryMethodPanelProps) {
  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2
        id={TITLE_ID}
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
      >
        Метод на доставка
      </h2>

      <DeliveryCutoffPromise promise={promise} className="mb-3" />

      <div role="radiogroup" aria-labelledby={TITLE_ID} className="flex flex-col gap-2">
        {B2C_DELIVERY_METHODS.map((option) => (
          <DeliveryOptionCard
            key={option.id}
            name="delivery-method"
            value={option.id}
            label={option.label}
            description={option.description}
            icon={METHOD_ICONS[option.id]}
            isSelected={method === option.id}
            onSelect={() => onMethodChange(option.id)}
          />
        ))}
      </div>

      <ProviderSlot method={method} />
    </section>
  );
}

/** Where the courier's own address form or office map mounts for the chosen method. */
function ProviderSlot({ method }: { method: DeliveryMethod }) {
  return (
    <div
      data-testid="delivery-provider-slot"
      data-method={method}
      className="mt-2.5 rounded-[10px] border border-dashed border-line-2 bg-canvas p-3.5 text-[12.5px] text-ink-3"
    >
      {PROVIDER_SLOT_COPY[method]}
    </div>
  );
}
