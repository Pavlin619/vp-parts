"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChevronRight, Info, MapPin, X } from "lucide-react";
import type { ReactNode } from "react";
import type { WarehouseRow } from "@/lib/delivery/availability";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { WarehouseBranchRow } from "./warehouse-branch-row";

interface WarehouseAvailabilityDialogProps {
  /** Stocked warehouses, already decorated with display names and fastest-first. */
  warehouses: WarehouseRow[];
  quantity: number;
  subtitle?: string;
  /**
   * A caller-owned clock used to format the per-warehouse dates. Omit it and
   * the panel runs its own — which is what list surfaces want, since a clock
   * per row would tick every closed row twice a minute for nothing.
   */
  now?: Date | null;
  /** Trigger contents — defaults to the buy box's chevron link. */
  trigger?: ReactNode;
  triggerClassName?: string;
}

const DEFAULT_TRIGGER_CLASS_NAME =
  "ml-[17px] mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-accent-hover hover:[&_svg]:translate-x-0.5";

/**
 * The full per-warehouse availability breakdown. Opened from the buy box stock
 * summary and from a catalog row's stock cell, so the trigger is overridable
 * while the panel itself stays identical everywhere. Lists each stocked
 * warehouse with its projected ready date and order cut-off; the backend owns
 * the dates, this only lays them out.
 */
export function WarehouseAvailabilityDialog({
  warehouses,
  quantity,
  subtitle,
  now,
  trigger,
  triggerClassName,
}: WarehouseAvailabilityDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={cn(triggerClassName ?? DEFAULT_TRIGGER_CLASS_NAME)}>
        {trigger ?? (
          <>
            Наличност по складове
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform"
              aria-hidden="true"
            />
          </>
        )}
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
              <WarehouseBranchList
                warehouses={warehouses}
                quantity={quantity}
                now={now}
              />
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The warehouse lines. Lives inside the portal so its clock only starts once
 * the dialog is actually open; a caller-supplied `now` still wins so the buy
 * box keeps formatting every date against its single shared clock.
 */
function WarehouseBranchList({
  warehouses,
  quantity,
  now,
}: {
  warehouses: WarehouseRow[];
  quantity: number;
  now?: Date | null;
}) {
  const liveNow = useNow();
  const effectiveNow = now === undefined ? liveNow : now;

  return (
    <div className="divide-y divide-line">
      {warehouses.map((warehouse) => (
        <WarehouseBranchRow
          key={warehouse.warehouseId}
          warehouse={warehouse}
          quantity={quantity}
          now={effectiveNow}
        />
      ))}
    </div>
  );
}
