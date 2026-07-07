"use client";

import { Check, Truck } from "lucide-react";
import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { DeliveryCutoffNotice } from "./delivery-cutoff-notice";

/** Free-shipping threshold copy for the courier panel. */
const FREE_SHIPPING_THRESHOLD_LABEL = "120 лв";

interface CourierPanelProps {
  warehouse: WarehouseAvailabilityDto;
  dateLabel: string;
}

/** Courier-to-address delivery detail: projected date, cut-off, free shipping. */
export function CourierPanel({ warehouse, dateLabel }: CourierPanelProps) {
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
