"use client";

import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { deliveryBand, summariseWarehouses } from "@/lib/delivery/availability";
import { DELIVERY_BAND } from "@/lib/delivery/bands";
import { cn } from "@/lib/utils";
import { WarehouseAvailabilityDialog } from "@/components/catalog/availability/warehouse-availability-dialog";

interface ArticleAvailabilityProps {
  availabilityByWarehouse?: WarehouseAvailabilityDto[];
  /** Selected line quantity — dims warehouses that can't fulfil it in the dialog. */
  quantity?: number;
  /** Feeds the dialog subtitle so the customer knows which part they are viewing. */
  articleName?: string;
  articleNumber?: string;
  /**
   * The shared clock from the buy box, used to format the per-warehouse dates
   * consistently. `null` before the live clock is ready.
   */
  now: Date | null;
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
  const band = DELIVERY_BAND[deliveryBand(homeWarehouse)];

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
        now={now}
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
