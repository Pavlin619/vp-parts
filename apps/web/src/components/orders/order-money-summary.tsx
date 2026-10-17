import { Banknote } from "lucide-react";
import {
  DeliveryMethod,
  formatPrice,
  PaymentMethod,
  type OrderDetailDto,
} from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

type OrderMoney = Pick<
  OrderDetailDto,
  | "goodsTotal"
  | "deliveryPrice"
  | "cashOnDeliveryFee"
  | "total"
  | "vatAmount"
  | "netAmount"
  | "paymentMethod"
  | "delivery"
>;

/** The order's money as it was frozen at placing, and what is paid on receipt. */
export function OrderMoneySummary({ order }: { order: OrderMoney }) {
  const isPickup = order.delivery.method === DeliveryMethod.STORE_PICKUP;

  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Обобщение на цените
      </h2>

      <dl>
        <MoneyRow label="Продукти" value={formatPrice(order.goodsTotal)} />
        <MoneyRow
          label="Доставка"
          value={isPickup ? "Безплатна" : formatPrice(order.deliveryPrice)}
        />
        {order.cashOnDeliveryFee > 0 && (
          <MoneyRow
            label="Такса наложен платеж"
            value={`+${formatPrice(order.cashOnDeliveryFee)}`}
            isFee
          />
        )}

        <div className="mt-2.5 flex items-baseline justify-between gap-4 border-t border-line pt-3.5">
          <dt className="text-sm font-semibold text-ink">Общо с ДДС</dt>
          <dd className="font-display text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
            {formatPrice(order.total)}
          </dd>
        </div>
        <MoneyRow label="в т.ч. ДДС" value={formatPrice(order.vatAmount)} isMinor />
        <MoneyRow label="Сума без ДДС" value={formatPrice(order.netAmount)} isMinor />
      </dl>

      {order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY && (
        <p className="mt-4 flex items-center gap-2 rounded-[10px] bg-bg-sunken px-3 py-2.5 text-[12.5px] font-semibold text-ink-2">
          <Banknote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Платете {formatPrice(order.total)}{" "}
          {isPickup ? "при вземане от магазина" : "при получаване"}
        </p>
      )}
    </section>
  );
}

function MoneyRow({
  label,
  value,
  isFee = false,
  isMinor = false,
}: {
  label: string;
  value: string;
  /** A charge added on top of the parts and delivery. */
  isFee?: boolean;
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
          isFee && "text-warn",
          isMinor && "text-ink-3",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
