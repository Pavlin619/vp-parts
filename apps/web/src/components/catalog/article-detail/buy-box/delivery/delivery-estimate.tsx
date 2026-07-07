"use client";

import { useState } from "react";
import { ShieldCheck, Store, Truck } from "lucide-react";
import type {
  DeliveryProjectionDto,
  WarehouseAvailabilityDto,
} from "@vp-parts-shop/shared";
import {
  isWarehouseSnapshotStale,
  selectWarehouseForQuantity,
} from "@/lib/delivery/availability";
import { formatDeliveryLabel } from "@/lib/delivery/format";
import { cn } from "@/lib/utils";
import { CourierPanel } from "./courier-panel";
import { StorePanel } from "./store-panel";

type Fulfilment = "courier" | "store";

/** Shown while a stale snapshot is being re-validated (see useDeliveryRefresh). */
const STALE_LABEL = "обновяване…";

interface DeliveryEstimateProps {
  availabilityByWarehouse: WarehouseAvailabilityDto[];
  /** Selected line quantity — the promise tracks the slowest band needed. */
  quantity: number;
  /** When the snapshot was computed (ISO UTC); drives staleness detection. */
  computedAt?: string | null;
  /**
   * The shared clock from the buy box. `null` means the live clock is not ready
   * yet (SSR / pre-hydration with no snapshot instant to fall back to), so we
   * render the neutral label rather than a date that might not survive
   * hydration.
   */
  now: Date | null;
}

/**
 * The B2C delivery module for the buy box. A segmented toggle switches between
 * courier delivery to an address (one working day extra) and free pickup from
 * the shop; each panel shows the projected date for the selected quantity plus
 * its own logistics detail. The backend owns every date computation — this only
 * formats the chosen projection.
 *
 * TODO(b2b): mechanics get car delivery; add a car-delivery panel once Clerk
 * roles are wired in.
 */
export function DeliveryEstimate({
  availabilityByWarehouse,
  quantity,
  computedAt,
  now,
}: DeliveryEstimateProps) {
  const [fulfilment, setFulfilment] = useState<Fulfilment>("courier");

  const warehouse = selectWarehouseForQuantity(availabilityByWarehouse, quantity);
  if (!warehouse) {
    return null;
  }

  // Never show a confidently-wrong date: with no live clock yet, or once the
  // snapshot has aged past a cut-off (or the within-the-hour moment), show a
  // neutral label until the page re-validates.
  const dateLabel = (projection: DeliveryProjectionDto) => {
    if (now === null || isWarehouseSnapshotStale(warehouse, computedAt, now)) {
      return STALE_LABEL;
    }
    return formatDeliveryLabel(projection, now);
  };

  return (
    <div className="mt-[18px] border-t border-line pt-[18px]">
      <div
        role="group"
        aria-label="Начин на получаване"
        className="grid grid-cols-2 gap-1 rounded-md border border-line bg-bg-sunken p-1"
      >
        <FulfilmentTab
          icon={<Truck className="h-[17px] w-[17px]" aria-hidden="true" />}
          label="С куриер"
          active={fulfilment === "courier"}
          onClick={() => setFulfilment("courier")}
        />
        <FulfilmentTab
          icon={<Store className="h-[17px] w-[17px]" aria-hidden="true" />}
          label="От магазин"
          active={fulfilment === "store"}
          onClick={() => setFulfilment("store")}
        />
      </div>

      <div className="mt-3.5">
        {fulfilment === "courier" ? (
          <CourierPanel
            warehouse={warehouse}
            dateLabel={dateLabel(warehouse.courier)}
          />
        ) : (
          <StorePanel readyLabel={dateLabel(warehouse.pickup)} />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-3.5 text-[13px]">
        <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-ink-3" aria-hidden="true" />
        <div>
          <b className="block font-semibold text-ink">2 години гаранция</b>
          <span className="text-xs text-ink-3">Връщане в 14 дни · 48ч рекламации</span>
        </div>
      </div>
    </div>
  );
}

function FulfilmentTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-10 items-center justify-center gap-[7px] rounded text-sm font-semibold transition-colors",
        active
          ? "bg-bg-card text-ink shadow-[0_1px_2px_rgba(11,18,32,0.08)] ring-1 ring-line [&_svg]:text-accent"
          : "text-ink-3 [&_svg]:text-ink-4",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
