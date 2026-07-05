"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChevronRight, Info, MapPin, X } from "lucide-react";
import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import {
  deliveryBand,
  summariseWarehouses,
  type DeliveryBand,
  type WarehouseRow,
} from "@/lib/delivery/availability";
import { formatDeliveryLabel } from "@/lib/delivery/format";
import { cn } from "@/lib/utils";

interface ArticleAvailabilityProps {
  availabilityByWarehouse?: WarehouseAvailabilityDto[];
  /** Selected line quantity — dims warehouses that can't fulfil it in the dialog. */
  quantity?: number;
  /** Feeds the dialog subtitle so the customer knows which part they are viewing. */
  articleName?: string;
  articleNumber?: string;
  /**
   * The shared clock from the buy box, used to format the per-warehouse dates
   * consistently. Omitted only in isolation (tests), where it defaults to now.
   */
  now?: Date | null;
}

/**
 * Stock summary for the buy box. The headline names the fastest in-stock
 * warehouse and its quantity; a secondary line rolls up the rest. The full
 * per-warehouse breakdown — quantity, projected pickup date and order cut-off —
 * opens in a dialog. Every date is computed by the backend; this component only
 * formats and lays it out.
 */
export function ArticleAvailability({
  availabilityByWarehouse = [],
  quantity = 1,
  articleName,
  articleNumber,
  now,
}: ArticleAvailabilityProps) {
  const { warehouses, totalQuantity } = summariseWarehouses(
    availabilityByWarehouse,
  );
  const homeWarehouse = warehouses[0];

  // `now === undefined` only in isolation (tests); production threads the shared
  // clock (possibly null before it is live).
  const effectiveNow = now === undefined ? new Date() : now;

  // Purchasable but no per-warehouse breakdown — keep a positive headline.
  if (!homeWarehouse) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
        Наличен в склад
      </p>
    );
  }

  const otherStock = totalQuantity - homeWarehouse.quantity;
  const otherCount = warehouses.length - 1;
  const band = BAND[deliveryBand(homeWarehouse)];

  return (
    <div>
      <p className="flex items-center gap-2 text-sm text-ink">
        <span
          className={cn("h-[9px] w-[9px] shrink-0 rounded-full", band.dot, band.halo)}
          aria-hidden="true"
        />
        <span data-testid="availability-headline">
          Наличен в <b className="font-semibold">{homeWarehouse.name}</b> ·{" "}
          {homeWarehouse.quantity} бр.
        </span>
      </p>

      {otherCount > 0 && (
        <p className="ml-[17px] mt-1 text-[12.5px] text-ink-3">
          + {otherStock} бр. в {otherCount}{" "}
          {otherCount === 1 ? "друг склад" : "други склада"}
        </p>
      )}

      <WarehouseAvailabilityDialog
        warehouses={warehouses}
        quantity={quantity}
        subtitle={buildSubtitle(articleName, articleNumber)}
        now={effectiveNow}
      />
    </div>
  );
}

function buildSubtitle(
  articleName?: string,
  articleNumber?: string,
): string | undefined {
  return [articleName, articleNumber].filter(Boolean).join(" · ") || undefined;
}

interface WarehouseAvailabilityDialogProps {
  /** Stocked warehouses, already decorated with display names and fastest-first. */
  warehouses: WarehouseRow[];
  quantity: number;
  subtitle?: string;
  now: Date | null;
}

function WarehouseAvailabilityDialog({
  warehouses,
  quantity,
  subtitle,
  now,
}: WarehouseAvailabilityDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="ml-[17px] mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-accent-hover hover:[&_svg]:translate-x-0.5">
        Наличност по складове
        <ChevronRight
          className="h-3.5 w-3.5 transition-transform"
          aria-hidden="true"
        />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/55" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-bg-card shadow-overlay outline-none">
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-ink text-white">
                <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div>
                <Dialog.Title className="font-display text-xl font-semibold text-ink">
                  Наличност по складове
                </Dialog.Title>
                {subtitle && (
                  <Dialog.Description className="text-xs text-ink-3">
                    {subtitle}
                  </Dialog.Description>
                )}
              </div>
            </div>
            <Dialog.Close
              aria-label="Затвори"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-bg-sunken hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="overflow-y-auto px-6 pb-[22px] pt-5">
            <div className="mb-4 flex gap-2.5 rounded-md bg-bg-sunken px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-3">
              <Info className="mt-px h-[15px] w-[15px] shrink-0 text-ink-4" aria-hidden="true" />
              <span>
                За да получиш в посочения срок, поръчай преди крайния час. Срокът
                е за вземане от склада — куриер добавя 1 работен ден.
              </span>
            </div>

            <div className="overflow-hidden rounded-md border border-line">
              <div className="flex items-center gap-2.5 border-b border-line bg-bg-sunken px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                <span className="shrink-0">Склад</span>
                <span className="flex-1">Готово за / поръчай до</span>
                <span className="shrink-0">Налич.</span>
              </div>
              <div className="divide-y divide-line">
                {warehouses.map((warehouse) => (
                  <WarehouseBranchRow
                    key={warehouse.warehouseId}
                    warehouse={warehouse}
                    quantity={quantity}
                    now={now}
                  />
                ))}
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WarehouseBranchRow({
  warehouse,
  quantity,
  now,
}: {
  warehouse: WarehouseRow;
  quantity: number;
  now: Date | null;
}) {
  const insufficient = warehouse.quantity < quantity;
  const band = BAND[deliveryBand(warehouse)];
  const readyLabel =
    now === null ? "—" : formatDeliveryLabel(warehouse.pickup, now);

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3.5 py-[11px]",
        insufficient && "opacity-50",
      )}
    >
      <span
        className={cn("h-[9px] w-[9px] shrink-0 rounded-full", band.dot)}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">
          {warehouse.name}
        </span>
        <span className="mt-px block text-xs text-ink-3">
          <b className={cn("font-semibold", band.text)}>
            готово {readyLabel}
          </b>
          {" · поръчай до "}
          {warehouse.orderCutoffTime} ч.
        </span>
      </span>
      <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-ink">
        {warehouse.quantity} бр.
      </span>
    </div>
  );
}

/**
 * Delivery-speed palette shared by the buy-box dot and the per-warehouse rows.
 * `dot` is the fill, `text` the readable inline tone tied to the "готово" date,
 * and `halo` the soft ring rendered only behind the buy-box headline dot. The
 * scale runs green → blue → yellow → orange as the promise slows.
 */
const BAND: Record<DeliveryBand, { dot: string; text: string; halo: string }> = {
  "within-hour": {
    dot: "bg-ok",
    text: "text-ok",
    halo: "shadow-[0_0_0_3px_var(--color-ok-soft)]",
  },
  today: {
    dot: "bg-info",
    text: "text-info",
    halo: "shadow-[0_0_0_3px_var(--color-info-soft)]",
  },
  day1: {
    dot: "bg-delivery-day1",
    text: "text-delivery-day1-fg",
    halo: "shadow-[0_0_0_3px_var(--color-delivery-day1-soft)]",
  },
  day2: {
    dot: "bg-delivery-day2",
    text: "text-delivery-day2-fg",
    halo: "shadow-[0_0_0_3px_var(--color-delivery-day2-soft)]",
  },
  day3: {
    dot: "bg-delivery-day3",
    text: "text-delivery-day3-fg",
    halo: "shadow-[0_0_0_3px_var(--color-delivery-day3-soft)]",
  },
};
