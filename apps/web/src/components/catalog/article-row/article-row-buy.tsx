"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { formatPrice } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import type { BuyBoxQuantity } from "@/hooks/use-buy-box-quantity";
import { usePricesIncludeVat } from "@/hooks/use-price-display";
import type { RowAvailability } from "@/lib/catalog/merge-availability";

/**
 * Two layouts for one cell, chosen by the row's own width (`--container-row-wide`).
 * In a wide row it is the last column, stacked and right-aligned; in a narrow
 * one it is a band across the bottom of the card, price on the left and the
 * actions on the right.
 *
 * The height floor belongs to the column layout alone, because there it is the
 * tallest cell and so sets the row's height: without it a back-ordered part, or
 * one whose availability has not landed yet, renders visibly shorter than the
 * row above and the list ripples as prices arrive. A floor rather than a fixed
 * height, so a cell that outgrows it is never clipped. As a band it is the last
 * thing in the card and nothing lines up beside it, so it simply takes the
 * height it needs.
 */
const BUY_COLUMN_CLASS_NAME =
  "col-span-2 flex items-center justify-between gap-3 border-t border-line pt-3 @row-wide:col-span-1 @row-wide:min-h-[88px] @row-wide:flex-col @row-wide:items-end @row-wide:gap-1 @row-wide:border-0 @row-wide:pt-0 @row-wide:text-right";

interface ArticleRowBuyProps {
  availability: RowAvailability;
  /** Shared with the stock cell so the dialog dims what it cannot fulfil. */
  quantity: BuyBoxQuantity;
  articleName: string;
  onAddToCart?: (quantity: number) => void;
}

/**
 * The row's buy column: price, quantity stepper and the add-to-cart action.
 * Price and stock both come from the separate availability read, so this column
 * skeletons and degrades in step with {@link ArticleRowAvailability}.
 */
export function ArticleRowBuy({
  availability,
  quantity,
  articleName,
  onAddToCart,
}: ArticleRowBuyProps) {
  const includesVat = usePricesIncludeVat();

  if (availability === undefined) {
    return <BuySkeleton />;
  }

  const price = includesVat
    ? (availability?.bestPriceIncVat ?? null)
    : (availability?.bestPriceExVat ?? null);
  const canBuy = availability?.available === true;

  return (
    <div className={BUY_COLUMN_CLASS_NAME} data-testid="article-row-buy">
      <div className="flex min-w-0 flex-col @row-wide:items-end">
        {price != null ? (
          <p className="whitespace-nowrap font-display text-lg font-semibold tracking-[-0.01em] tabular-nums text-ink">
            {formatPrice(price)}
          </p>
        ) : (
          <p className="font-display text-lg font-semibold text-ink-3">—</p>
        )}

        <p className="text-[10.5px] text-ink-3">
          {includesVat ? "с ДДС" : "без ДДС"} · за брой
        </p>
      </div>

      {canBuy && (
        <div className="flex shrink-0 items-center gap-1.5 @row-wide:mt-1">
          <div className="flex h-8 items-center rounded-md border border-line">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => quantity.changeQuantity(-1)}
              disabled={quantity.selectedQuantity <= 1}
              aria-label="Намали количеството"
              className="h-8 w-[26px] rounded-l-md rounded-r-none text-ink"
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </Button>
            <span
              className="w-[26px] text-center font-display text-xs font-medium tabular-nums text-ink"
              aria-label="Количество"
            >
              {quantity.selectedQuantity}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => quantity.changeQuantity(1)}
              disabled={quantity.selectedQuantity >= quantity.maxQuantity}
              aria-label="Увеличи количеството"
              className="h-8 w-[26px] rounded-l-none rounded-r-md text-ink"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>

          <Button
            type="button"
            onClick={() => onAddToCart?.(quantity.selectedQuantity)}
            aria-label={`Добави ${articleName} в кошницата`}
            className="h-8 gap-1.5 rounded-md bg-ink px-3 text-white hover:bg-accent"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Placeholder while the separate availability read resolves the price. */
function BuySkeleton() {
  return (
    <div className={BUY_COLUMN_CLASS_NAME} data-testid="article-row-buy">
      <div className="flex flex-col gap-1 @row-wide:items-end">
        <span
          data-testid="article-row-buy-skeleton"
          className="block h-[22px] w-[76px] animate-pulse rounded bg-bg-sunken"
          aria-hidden="true"
        />
        <span
          className="block h-3 w-[64px] animate-pulse rounded bg-bg-sunken"
          aria-hidden="true"
        />
      </div>
      <span
        className="block h-8 w-[112px] shrink-0 animate-pulse rounded-md bg-bg-sunken @row-wide:mt-1"
        aria-hidden="true"
      />
    </div>
  );
}
