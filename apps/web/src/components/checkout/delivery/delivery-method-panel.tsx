"use client";

import { useId, type ReactNode } from "react";
import { MapPin, Store, Truck } from "lucide-react";
import { DeliveryCutoffPromise } from "@/components/delivery";
import {
  B2C_DELIVERY_METHODS,
  CHECKOUT_CARRIER,
  type DeliveryMethod,
} from "@/lib/checkout/delivery/delivery-methods";
import type { DeliveryPromise } from "@/lib/delivery/promise";
import { DeliveryOptionCard } from "./delivery-option-card";
import { StorePickupCard } from "./store-pickup-card";
import { AddressPicker } from "./address";
import { OfficePicker } from "./offices";

const METHOD_ICONS: Record<DeliveryMethod, ReactNode> = {
  "courier-address": <Truck />,
  "courier-office": <MapPin />,
  "store-pickup": <Store />,
};

interface DeliveryMethodPanelProps {
  method: DeliveryMethod | null;
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

      {method && <ProviderSlot method={method} />}
    </section>
  );
}

/** Where the chosen method's picker, or the store a pickup is collected from, mounts. */
function ProviderSlot({ method }: { method: DeliveryMethod }) {
  return (
    <div data-testid="delivery-provider-slot" data-method={method} className="mt-2.5">
      <MethodDetail method={method} />
    </div>
  );
}

function MethodDetail({ method }: { method: DeliveryMethod }) {
  switch (method) {
    case "courier-address":
      return <AddressPicker carrier={CHECKOUT_CARRIER} />;
    case "courier-office":
      return <OfficePicker carrier={CHECKOUT_CARRIER} />;
    case "store-pickup":
      return <StorePickupCard />;
  }
}
