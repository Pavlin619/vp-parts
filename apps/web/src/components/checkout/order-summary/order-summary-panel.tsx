import { ArrowRight, Loader2, Phone } from "lucide-react";
import { formatPrice, PaymentMethod } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import type { PlaceOrder } from "@/hooks/use-place-order";
import {
  formatWeight,
  type DeliverySummary,
  type SummaryMoney,
} from "@/lib/checkout/delivery/delivery-summary";
import type { ParcelCheck } from "@/lib/checkout/delivery/office-availability";
import { isPaidOnDelivery } from "@/lib/checkout/payment/payment-methods";
import { formatDay, formatShopDate } from "@/lib/delivery/format";
import { cn } from "@/lib/utils";
import { OrderTermsNote } from "./order-terms-note";
import { PlaceOrderFailureNotice } from "./place-order-failure-notice";

const NOT_CALCULATED = "—";

const BUTTON_CLASSES = "mt-4 h-12 w-full gap-2 rounded-md text-sm font-semibold";

const DELIVERY_COPY: Record<
  Exclude<DeliverySummary["kind"], "pending" | "pickup" | "quoted">,
  string
> = {
  "not-quoted": NOT_CALCULATED,
  "awaiting-method": "Изберете метод",
  "awaiting-office": "Изберете офис",
  "awaiting-address": "Въведете адрес",
  "address-unusable": "Проверете адреса",
  "office-unusable": "Изберете друг офис",
  failed: "Не може да се изчисли",
};

interface OrderSummaryPanelProps {
  /** As the API priced it; null while it is being read. */
  money: SummaryMoney | null;
  /** The money could not be read, so a figure is a dash rather than a skeleton. */
  isMoneyFailed: boolean;
  parcelCheck: ParcelCheck;
  delivery: DeliverySummary;
  /** A quick order is requested for a call-back rather than placed outright. */
  isQuickOrder: boolean;
  paymentMethod: PaymentMethod | null;
  order: PlaceOrder;
}

/**
 * The order's money at a glance, under the item recap, and the button that
 * places it. Every figure is the API's; the browser adds nothing up.
 */
export function OrderSummaryPanel({
  money,
  isMoneyFailed,
  parcelCheck,
  delivery,
  isQuickOrder,
  paymentMethod,
  order,
}: OrderSummaryPanelProps) {
  // A store pickup is paid at our counter, so no courier charges for collecting it.
  const isCollectedByCourier =
    isPaidOnDelivery(isQuickOrder, paymentMethod) && delivery.kind !== "pickup";
  const moneyText = (amount: (figures: SummaryMoney) => number) =>
    money ? formatPrice(amount(money)) : isMoneyFailed ? NOT_CALCULATED : null;

  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Обобщение на поръчката
      </h2>

      <dl>
        <SummaryRow label="Общо тегло" value={weightText(parcelCheck)} />
        <SummaryRow label="Продукти" value={moneyText((figures) => figures.goodsTotal)} />
        <SummaryRow label="Цена на доставката" value={deliveryText(delivery)} />
        {isCollectedByCourier && (
          <SummaryRow label="Такса наложен платеж" value={cashOnDeliveryFeeText(delivery)} />
        )}
        <SummaryRow
          label={delivery.kind === "pickup" ? "Готова за вземане" : "Очаквана доставка"}
          value={deliveryDateText(delivery)}
        />

        <div className="mt-2.5 flex items-baseline justify-between gap-4 border-t border-line pt-3.5">
          <dt className="text-sm font-semibold text-ink">Общо с ДДС</dt>
          <dd className="font-display text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
            {moneyText((figures) => figures.total) ?? (
              <span
                className="block h-[30px] w-[116px] animate-pulse rounded bg-bg-sunken"
                aria-hidden="true"
              />
            )}
          </dd>
        </div>
        {money && !money.isDeliveryIncluded && (
          <p className="mt-1 text-right text-[11.5px] text-ink-3">Без цената на доставката</p>
        )}
        <SummaryRow
          label="в т.ч. ДДС"
          value={moneyText((figures) => figures.vatAmount)}
          isMinor
        />
        <SummaryRow
          label="Сума без ДДС"
          value={moneyText((figures) => figures.netAmount)}
          isMinor
        />
      </dl>

      <PlaceOrderButton isQuickOrder={isQuickOrder} order={order} />

      {order.failure && (
        <PlaceOrderFailureNotice failure={order.failure} currentTotal={money?.total ?? null} />
      )}

      {!isQuickOrder && <OrderTermsNote />}
    </section>
  );
}

/**
 * Worded so ordering plainly means paying (ЗЗП чл. 49, ал. 2; CJEU C-249/21): buying
 * implies paying, while "Поръчай сега" or "Завърши поръчката" would not bind the consumer.
 */
function PlaceOrderButton({
  isQuickOrder,
  order,
}: {
  isQuickOrder: boolean;
  order: PlaceOrder;
}) {
  if (isQuickOrder) {
    return (
      <Button type="button" size="lg" disabled className={BUTTON_CLASSES}>
        <Phone className="h-4 w-4" aria-hidden="true" />
        Заяви поръчка
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="lg"
      disabled={!order.canPlace}
      aria-busy={order.isPlacing}
      onClick={order.place}
      className={BUTTON_CLASSES}
    >
      Купи сега
      {order.isPlacing ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
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
    case "pickup":
      return "Безплатна";
    case "quoted":
      return formatPrice(delivery.priceIncVatCents);
    default:
      return DELIVERY_COPY[delivery.kind];
  }
}

function cashOnDeliveryFeeText(delivery: DeliverySummary): string | null {
  switch (delivery.kind) {
    case "pending":
      return null;
    case "quoted":
      return delivery.cashOnDeliveryFeeIncVatCents === null
        ? NOT_CALCULATED
        : formatPrice(delivery.cashOnDeliveryFeeIncVatCents);
    default:
      return NOT_CALCULATED;
  }
}

function deliveryDateText(delivery: DeliverySummary): string | null {
  switch (delivery.kind) {
    case "pending":
      return null;
    case "pickup":
      return delivery.readyAt ? formatDay(delivery.readyAt) : NOT_CALCULATED;
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
  isMinor = false,
}: {
  label: string;
  value: string | null;
  /** A breakdown of the total rather than a part of it. */
  isMinor?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-[5px] text-[13px]",
        isMinor && "py-[2px] text-[12px]",
      )}
    >
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={cn(
          "font-display font-medium tabular-nums text-ink",
          isMinor && "text-ink-3",
        )}
      >
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
