"use client";

import {
  deliveryBand,
  formatStockQuantity,
  type WarehouseRow,
} from "@/lib/delivery/availability";
import { DELIVERY_BAND } from "@/lib/delivery/bands";
import { formatDeliveryLabel } from "@/lib/delivery/format";
import { cn } from "@/lib/utils";

interface WarehouseBranchRowProps {
  warehouse: WarehouseRow;
  quantity: number;
  now: Date | null;
}

/**
 * One warehouse line in the availability dialog: speed dot, name, projected
 * ready date and order cut-off, and its stock. Dimmed when it alone cannot
 * fulfil the selected quantity.
 */
export function WarehouseBranchRow({
  warehouse,
  quantity,
  now,
}: WarehouseBranchRowProps) {
  const insufficient = warehouse.quantity < quantity;
  const band = DELIVERY_BAND[deliveryBand(warehouse)];
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
        {formatStockQuantity(warehouse.quantity)} бр.
      </span>
    </div>
  );
}
