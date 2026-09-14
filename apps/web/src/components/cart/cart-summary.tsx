"use client";

import { ArrowRight, Info } from "lucide-react";
import { formatCount, formatPrice } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import type { CartTotals } from "@/lib/cart/cart-totals";

interface CartSummaryProps {
  totals: CartTotals;
  /** True while the availability read is in flight — the figures are not final. */
  isPending: boolean;
}

/**
 * The order summary beside the lines. Prints the net sum, the VAT and the gross
 * total together rather than following the visitor's VAT preference: a cart is
 * where a trade customer checks the net figure and every customer checks what
 * will actually be charged, and those are two different numbers.
 *
 * VAT is shown without its rate. The rate is the backoffice's to set and
 * reaches us as an amount, so printing "20%" here would be a second claim to
 * keep true.
 */
export function CartSummary({ totals, isPending }: CartSummaryProps) {
  return (
    <div className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Обобщение
      </h2>

      <dl>
        <SummaryRow label="Избрани продукти" value={formatCount(totals.itemCount)} />
        <SummaryRow
          label="Сума без ДДС"
          value={isPending ? null : formatPrice(totals.subtotalExVat)}
        />
        <SummaryRow
          label="ДДС"
          value={isPending ? null : formatPrice(totals.vatAmount)}
        />

        <div className="mt-2.5 flex items-baseline justify-between gap-4 border-t border-line pt-3.5">
          <dt className="text-sm font-semibold text-ink">Общо с ДДС</dt>
          <dd className="font-display text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
            {isPending ? (
              <span
                className="block h-[30px] w-[116px] animate-pulse rounded bg-bg-sunken"
                aria-hidden="true"
              />
            ) : (
              formatPrice(totals.totalIncVat)
            )}
          </dd>
        </div>
      </dl>

      {totals.hasBlockedLines && !isPending && (
        <p className="mt-3 text-[11.5px] leading-[1.45] text-danger">
          Сумата не включва артикулите с недостатъчна наличност.
        </p>
      )}

      {totals.hasUnpricedLines && !isPending && (
        <p className="mt-3 text-[11.5px] leading-[1.45] text-warn">
          Сумата не включва артикулите без актуална цена.
        </p>
      )}

      {/* Disabled until the delivery and payment step exists. The steps
          indicator above the list says the same thing, so the button staying
          put is less confusing than it disappearing. Whatever enables it must
          keep it disabled while `hasBlockedLines`: those lines carry no money
          in the total and no stock to draw on. */}
      <Button
        type="button"
        size="lg"
        disabled
        className="mt-4 h-12 w-full gap-2 rounded-md text-sm font-semibold"
      >
        Към доставка и плащане
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <p className="mt-2.5 flex items-start gap-[7px] text-[11.5px] leading-[1.45] text-ink-3">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden="true" />
        Цената за доставка се изчислява на следващата стъпка според избрания метод.
      </p>
    </div>
  );
}

/** One label/figure line; a `null` value is still being read. */
function SummaryRow({ label, value }: { label: string; value: string | null }) {
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
