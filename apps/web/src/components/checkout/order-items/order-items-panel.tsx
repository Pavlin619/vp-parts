import Link from "next/link";
import type { CartRowModel } from "@/lib/cart/cart-totals";
import { OrderItemRow } from "./order-item-row";

interface OrderItemsPanelProps {
  rows: CartRowModel[];
  itemCount: number;
}

/** The compact recap of what is being ordered, beside the delivery and payment choices. */
export function OrderItemsPanel({ rows, itemCount }: OrderItemsPanelProps) {
  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Артикули · {itemCount}
        </h2>
        <Link
          href="/cart"
          className="text-[11.5px] font-semibold text-accent-hover hover:underline"
        >
          Промени
        </Link>
      </div>

      <ul aria-label="Артикули в поръчката" className="flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <li
            key={`${row.line.brandId}-${row.line.articleNumber}`}
            className="py-2 first:pt-0 last:pb-0"
          >
            <OrderItemRow row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}
