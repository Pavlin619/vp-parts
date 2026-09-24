"use client";

import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { formatCount, formatPrice } from "@vp-parts-shop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { DeliveryCutoffPromise } from "@/components/delivery";
import type { CartTotals } from "@/lib/cart/cart-totals";
import type { DeliveryPromise } from "@/lib/delivery/promise";
import { cn } from "@/lib/utils";

/**
 * Why the deadline shown is a pickup one: the method is step two, and courier
 * adds a working day on top of it.
 */
const METHOD_NOTE =
  "Изберете метод на доставка на следващата стъпка — с куриер добавя 1 работен ден.";

interface CartSummaryProps {
  totals: CartTotals;
  /** True while the availability read is in flight — the figures are not final. */
  isPending: boolean;
  /** Whether live figures have been read at all — false when the read failed outright. */
  hasPrices: boolean;
  /** The deadline the whole basket is racing; null when there is none to show. */
  promise: DeliveryPromise | null;
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
export function CartSummary({ totals, isPending, hasPrices, promise }: CartSummaryProps) {
  // Without a live read no line has known stock, so none reads as blocked —
  // and blocked lines carry no money and no stock to draw on. Either way there
  // is nothing yet to carry into checkout.
  const canProceed = hasPrices && !totals.hasBlockedLines && totals.itemCount > 0;

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

      <DeliveryCutoffPromise promise={promise} note={METHOD_NOTE} className="mt-4" />

      <ProceedToCheckout canProceed={canProceed} />

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

const PROCEED_CLASSES = "mt-4 h-12 w-full gap-2 rounded-md text-sm font-semibold";

function ProceedToCheckout({ canProceed }: { canProceed: boolean }) {
  const content = (
    <>
      Към доставка и плащане
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </>
  );

  if (!canProceed) {
    return (
      <Button type="button" size="lg" disabled className={PROCEED_CLASSES}>
        {content}
      </Button>
    );
  }

  return (
    <Link href="/checkout" className={cn(buttonVariants({ size: "lg" }), PROCEED_CLASSES)}>
      {content}
    </Link>
  );
}
