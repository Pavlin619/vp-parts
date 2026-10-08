import { ArrowRight } from "lucide-react";
import { formatPrice } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import type { CartTotals } from "@/lib/cart/cart-totals";
import {
  formatWeight,
  summaryTotal,
  type DeliverySummary,
} from "@/lib/checkout/delivery/delivery-summary";
import type { ParcelCheck } from "@/lib/checkout/delivery/office-availability";
import { formatShopDate } from "@/lib/delivery/format";

const NOT_CALCULATED = "—";

const DELIVERY_COPY: Record<Exclude<DeliverySummary["kind"], "pending" | "quoted">, string> = {
  "not-quoted": NOT_CALCULATED,
  "awaiting-office": "Изберете офис",
  "office-unusable": "Изберете друг офис",
  failed: "Не може да се изчисли",
};

interface OrderSummaryPanelProps {
  totals: CartTotals;
  /** True while the availability read is in flight — the figures are not final. */
  isPending: boolean;
  parcelCheck: ParcelCheck;
  delivery: DeliverySummary;
}

/**
 * The order's money at a glance, under the item recap. The action stays
 * disabled until there is a payment method to submit.
 */
export function OrderSummaryPanel({
  totals,
  isPending,
  parcelCheck,
  delivery,
}: OrderSummaryPanelProps) {
  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Обобщение на поръчката
      </h2>

      <dl>
        <SummaryRow label="Общо тегло" value={weightText(parcelCheck)} />
        <SummaryRow
          label="Сума без ДДС"
          value={isPending ? null : formatPrice(totals.subtotalExVat)}
        />
        <SummaryRow label="ДДС" value={isPending ? null : formatPrice(totals.vatAmount)} />
        <SummaryRow label="Цена на доставката" value={deliveryText(delivery)} />
        <SummaryRow label="Очаквана доставка" value={deliveryDateText(delivery)} />

        <div className="mt-2.5 flex items-baseline justify-between gap-4 border-t border-line pt-3.5">
          <dt className="text-sm font-semibold text-ink">Общо с ДДС</dt>
          <dd className="font-display text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
            {isPending ? (
              <span
                className="block h-[30px] w-[116px] animate-pulse rounded bg-bg-sunken"
                aria-hidden="true"
              />
            ) : (
              formatPrice(summaryTotal(totals.totalIncVat, delivery))
            )}
          </dd>
        </div>
        {delivery.kind !== "quoted" && (
          <p className="mt-1 text-right text-[11.5px] text-ink-3">Без цената на доставката</p>
        )}
      </dl>

      <Button
        type="button"
        size="lg"
        disabled
        className="mt-4 h-12 w-full gap-2 rounded-md text-sm font-semibold"
      >
        Поръчай сега
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </section>
  );
}

function weightText(parcelCheck: ParcelCheck): string | null {
  switch (parcelCheck.state) {
    case "checking":
      return null;
    case "failed":
      return NOT_CALCULATED;
    case "ready":
      return formatWeight(parcelCheck.parcel.weightGrams);
  }
}

function deliveryText(delivery: DeliverySummary): string | null {
  switch (delivery.kind) {
    case "pending":
      return null;
    case "quoted":
      return formatPrice(delivery.priceIncVatCents);
    default:
      return DELIVERY_COPY[delivery.kind];
  }
}

function deliveryDateText(delivery: DeliverySummary): string | null {
  switch (delivery.kind) {
    case "pending":
      return null;
    case "quoted":
      return delivery.expectedDeliveryDate
        ? formatShopDate(delivery.expectedDeliveryDate)
        : NOT_CALCULATED;
    default:
      return NOT_CALCULATED;
  }
}

/** One label/figure line; a `null` value is still being read. */
function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[5px] text-[13px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-display font-medium tabular-nums text-ink">
        {value ?? (
          <span
            className="block h-4 w-[68px] animate-pulse rounded bg-bg-sunken"
            aria-hidden="true"
          />
        )}
      </dd>
    </div>
  );
}
