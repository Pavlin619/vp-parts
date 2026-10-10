"use client";

import { useId, type ReactNode } from "react";
import { MapPin, Truck } from "lucide-react";
import { DeliveryCutoffPromise } from "@/components/delivery";
import {
  B2C_DELIVERY_METHODS,
  OFFICE_DELIVERY_CARRIER,
  type DeliveryMethod,
} from "@/lib/checkout/delivery/delivery-methods";
import type { DeliveryPromise } from "@/lib/delivery/promise";
import { DeliveryOptionCard } from "./delivery-option-card";
import { AddressPicker } from "./address";
import { OfficePicker } from "./offices";

const METHOD_ICONS: Record<DeliveryMethod, ReactNode> = {
  "courier-address": <Truck />,
  "courier-office": <MapPin />,
};

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
  const titleId = useId();

  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2
        id={titleId}
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
      >
        Метод на доставка
      </h2>

      <DeliveryCutoffPromise promise={promise} className="mb-3" />

      <div role="radiogroup" aria-labelledby={titleId} className="flex flex-col gap-2">
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

/** Where the courier's address form or office picker mounts for the chosen method. */
function ProviderSlot({ method }: { method: DeliveryMethod }) {
  if (method === "courier-office") {
    return (
      <div data-testid="delivery-provider-slot" data-method={method} className="mt-2.5">
        <OfficePicker carrier={OFFICE_DELIVERY_CARRIER} />
      </div>
    );
  }

  return (
    <div data-testid="delivery-provider-slot" data-method={method} className="mt-2.5">
      <AddressPicker carrier={OFFICE_DELIVERY_CARRIER} />
    </div>
  );
}
