"use client";

import { TriangleAlert, X } from "lucide-react";
import { formatPrice } from "@vp-parts-shop/shared";
import {
  ArticleIdentity,
  ArticleThumbnail,
} from "@/components/catalog/article-row";
import { QuantityStepper } from "@/components/common/quantity-stepper";
import { articleDetailHref } from "@/lib/catalog/links/article-href";
import type { CartRowModel } from "@/lib/cart/cart-totals";
import { cn } from "@/lib/utils";

interface CartDrawerRowProps {
  row: CartRowModel;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

/**
 * One line in the cart drawer: what the part is, how many, what it costs.
 *
 * Deliberately narrower than the cart page's row — no delivery promise, no
 * per-warehouse stock, no checkbox. The drawer answers "what is in my cart and
 * what does it come to"; everything about *when* it arrives is the cart page's
 * and the checkout's to answer, and a promise quoted in a panel that closes on
 * the next click is a promise nobody can act on.
 */
export function CartDrawerRow({
  row,
  onQuantityChange,
  onRemove,
}: CartDrawerRowProps) {
  const { line, availability, unitPriceIncVat, lineTotalIncVat } = row;
  const href = articleDetailHref(line.brandId, line.articleNumber);
  const isPending = availability === undefined;

  return (
    <article
      className={cn(
        "flex items-start gap-3 py-3.5",
        // Still in the cart, simply not part of this order — so it recedes
        // rather than disappears, and the total below it adds up.
        !line.isSelected && "opacity-60",
      )}
      aria-busy={isPending}
    >
      <ArticleThumbnail href={href} thumbnailUrl={line.thumbnailUrl} />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <ArticleIdentity
          href={href}
          articleNumber={line.articleNumber}
          description={line.description}
          meta={line.brandName}
        />

        <div className="flex items-center gap-2">
          <QuantityStepper
            value={line.quantity}
            max={row.maxQuantity}
            onChange={onQuantityChange}
            itemLabel={line.articleNumber}
          />

          {line.quantity > 1 && unitPriceIncVat != null && (
            <span className="whitespace-nowrap text-[11.5px] tabular-nums text-ink-3">
              {line.quantity} × {formatPrice(unitPriceIncVat)}
            </span>
          )}

          {!line.isSelected && (
            <span className="text-[11.5px] text-ink-3">Не е избран</span>
          )}
        </div>

        {row.issue && (
          <p className="flex items-center gap-1.5 rounded-md bg-danger/8 px-2 py-1 text-[11.5px] font-medium text-danger">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {row.issue === "unavailable"
              ? "Артикулът вече не е наличен."
              : `Налични са само ${row.availableQuantity} бр.`}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Премахни ${line.articleNumber} от кошницата`}
          className="grid h-6 w-6 place-items-center rounded-md text-ink-4 transition-colors hover:bg-bg-sunken hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-[15px] w-[15px]" aria-hidden="true" />
        </button>

        {isPending ? (
          <span
            data-testid="cart-drawer-price-skeleton"
            className="block h-[18px] w-[68px] animate-pulse rounded bg-bg-sunken"
            aria-hidden="true"
          />
        ) : (
          <p className="whitespace-nowrap font-display text-[15px] font-semibold tabular-nums text-ink">
            {lineTotalIncVat != null ? formatPrice(lineTotalIncVat) : "—"}
          </p>
        )}
      </div>
    </article>
  );
}
