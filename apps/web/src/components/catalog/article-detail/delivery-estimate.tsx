"use client";

import { useState } from "react";
import { Check, Clock, MapPin, Phone, ShieldCheck, Store, Truck } from "lucide-react";
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
import { DeliveryCutoffNotice } from "./delivery-cutoff-notice";

type Fulfilment = "courier" | "store";

/** Shown while a stale snapshot is being re-validated (see useDeliveryRefresh). */
const STALE_LABEL = "обновяване…";

/** Free-shipping threshold copy for the courier panel. */
const FREE_SHIPPING_THRESHOLD_LABEL = "120 лв";

/**
 * The single physical retail location customers can collect from. Static shop
 * details; the ready date is computed per order from the pickup projection.
 */
const STORE = {
  name: "Магазин Плевен",
  address: "ул. Полтава 19",
  cityZip: "5809 Плевен",
  phone: "+359 88 8336843",
  hours: "Пон–Пет 9:00–18:00 · Съб 9:00–14:00",
} as const;

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
   * hydration. Omitted only in isolation (tests), where it defaults to now.
   */
  now?: Date | null;
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

  // `now === undefined` only in isolation (tests); production always threads the
  // shared clock (possibly null before it is live).
  const effectiveNow = now === undefined ? new Date() : now;

  // Never show a confidently-wrong date: with no live clock yet, or once the
  // snapshot has aged past a cut-off (or the within-the-hour moment), show a
  // neutral label until the page re-validates.
  const dateLabel = (projection: DeliveryProjectionDto) => {
    if (
      effectiveNow === null ||
      isWarehouseSnapshotStale(warehouse, computedAt, effectiveNow)
    ) {
      return STALE_LABEL;
    }
    return formatDeliveryLabel(projection, effectiveNow);
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

function CourierPanel({
  warehouse,
  dateLabel,
}: {
  warehouse: WarehouseAvailabilityDto;
  dateLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
          <Truck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight text-ink">
            Доставка{" "}
            <b
              className="font-bold"
              data-testid="delivery-estimate-chip-courier"
            >
              {dateLabel}
            </b>
            <span className="ml-1.5 inline-block rounded-full bg-ok-soft px-[7px] py-0.5 align-[1px] text-[11px] font-semibold text-ok">
              най-бързо
            </span>
          </p>
          <p className="mt-[3px] text-xs text-ink-3">До адрес · Еконт / Спиди</p>
        </div>
      </div>

      <DeliveryCutoffNotice warehouse={warehouse} />

      <div className="border-t border-dashed border-line pt-3">
        <p className="inline-flex items-center gap-1.5 rounded-sm bg-ok-soft px-[9px] py-[5px] text-xs font-semibold text-ok">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Безплатна доставка при поръчка над {FREE_SHIPPING_THRESHOLD_LABEL}
        </p>
      </div>
    </div>
  );
}

function StorePanel({ readyLabel }: { readyLabel: string }) {
  return (
    <div>
      <div className="flex gap-3">
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent-hover">
          <Store className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight text-ink">
            {STORE.name}
            <span className="ml-1.5 inline-block rounded-full bg-accent-soft px-[7px] py-0.5 align-[1px] text-[11px] font-semibold text-accent-hover">
              безплатно
            </span>
          </p>
          <p className="mt-[3px] text-xs text-ink-3">
            Готово за вземане{" "}
            <b className="font-semibold text-ink-2" data-testid="delivery-estimate-chip-store">
              {readyLabel}
            </b>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2.5 border-t border-dashed border-line pt-3 text-[12.5px] leading-snug text-ink-2">
        <StoreDetailRow icon={<MapPin className="h-[15px] w-[15px]" aria-hidden="true" />}>
          {STORE.address}
          <br />
          {STORE.cityZip}
        </StoreDetailRow>
        <StoreDetailRow icon={<Clock className="h-[15px] w-[15px]" aria-hidden="true" />}>
          {STORE.hours}
        </StoreDetailRow>
        <StoreDetailRow icon={<Phone className="h-[15px] w-[15px]" aria-hidden="true" />}>
          {STORE.phone}
        </StoreDetailRow>
      </div>
    </div>
  );
}

function StoreDetailRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex gap-2.5">
      <span className="mt-px shrink-0 text-ink-3">{icon}</span>
      <span>{children}</span>
    </p>
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
