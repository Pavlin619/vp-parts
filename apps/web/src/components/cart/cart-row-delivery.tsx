"use client";

import { MapPin, Truck } from "lucide-react";
import { useMemo } from "react";
import { WarehouseAvailabilityDialog } from "@/components/catalog/availability/warehouse-availability-dialog";
import { DeliveryChip, RowCell } from "@/components/catalog/article-row";
import {
  deliveryBand,
  formatStockQuantity,
  resolveLineFulfilment,
} from "@/lib/delivery/availability";
import { DELIVERY_BAND, DELIVERY_BAND_LABEL } from "@/lib/delivery/bands";
import type { RowAvailability } from "@/lib/catalog/merge-availability";
import { cn } from "@/lib/utils";

interface CartRowDeliveryProps {
  availability: RowAvailability;
  articleNumber: string;
  articleName: string;
  /** The line quantity — decides which warehouse the whole line ships from. */
  quantity: number;
}

/**
 * The cart line's single live-inventory cell: how fast the part ships, and
 * under it the way into the per-warehouse breakdown.
 *
 * The catalog row spends two columns here — one for the promise and one for the
 * stock — because a visitor comparing parts is choosing between them. By the
 * cart that choice is made, so the stock figure is demoted to the label on the
 * warehouses link rather than given a column of its own.
 */
export function CartRowDelivery({
  availability,
  articleNumber,
  articleName,
  quantity,
}: CartRowDeliveryProps) {
  const { warehouses, warehouse } = useMemo(
    () =>
      resolveLineFulfilment(availability?.availabilityByWarehouse ?? [], quantity),
    [availability?.availabilityByWarehouse, quantity],
  );

  if (availability === undefined) {
    return (
      <RowCell title="Доставка">
        <span
          data-testid="cart-row-delivery-skeleton"
          className="block h-[26px] w-[92px] animate-pulse rounded-[5px] bg-bg-sunken"
          aria-hidden="true"
        />
      </RowCell>
    );
  }

  // A failed read is not a verdict on the part, so it never falls back to
  // "out of stock".
  if (availability === null) {
    return (
      <RowCell title="Доставка">
        <span className="text-[11.5px] text-ink-3">Няма данни</span>
      </RowCell>
    );
  }

  if (!availability.available) {
    return (
      <RowCell title="Доставка">
        <DeliveryChip className="bg-danger/10 text-danger">
          няма налично
        </DeliveryChip>
      </RowCell>
    );
  }

  // Purchasable, but the payload carries no per-warehouse breakdown: it is in
  // stock, yet a delivery band here would promise a date we have no data for.
  if (!warehouse) {
    return (
      <RowCell title="Доставка">
        <DeliveryChip className="bg-bg-sunken text-ink-2">
          в наличност
        </DeliveryChip>
      </RowCell>
    );
  }

  const band = deliveryBand(warehouse);
  const tone = DELIVERY_BAND[band];

  return (
    <RowCell title="Доставка">
      <DeliveryChip className={cn(tone.soft, tone.text)}>
        <Truck className="h-3 w-3" aria-hidden="true" />
        {DELIVERY_BAND_LABEL[band]}
      </DeliveryChip>

      <WarehouseAvailabilityDialog
        warehouses={warehouses}
        quantity={quantity}
        subtitle={`${articleName} · ${articleNumber}`}
        triggerClassName="mt-1.5 flex w-full items-center gap-1 text-[11px] font-semibold text-accent-hover"
        trigger={
          <>
            <MapPin className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate">
              {formatStockQuantity(warehouse.quantity)} бр. · {warehouse.name}
            </span>
          </>
        }
      />
    </RowCell>
  );
}
