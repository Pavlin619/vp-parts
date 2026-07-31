"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { formatPrice } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import type { BuyBoxQuantity } from "@/hooks/use-buy-box-quantity";
import type { RowAvailability } from "@/lib/catalog/merge-availability";

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
  if (availability === undefined) {
    return <BuySkeleton />;
  }

  const price = availability?.bestPriceIncVat ?? null;
  const canBuy = availability?.available === true;

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      {price != null ? (
        <p className="whitespace-nowrap font-display text-lg font-semibold tracking-[-0.01em] tabular-nums text-ink">
          {formatPrice(price)}
        </p>
      ) : (
        <p className="font-display text-lg font-semibold text-ink-3">—</p>
      )}

      <p className="text-[10.5px] text-ink-3">с ДДС · за брой</p>

      {canBuy && (
        <div className="mt-1 flex items-center gap-1.5">
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
    <div className="flex flex-col items-end gap-1">
      <span
        data-testid="article-row-buy-skeleton"
        className="block h-[22px] w-[76px] animate-pulse rounded bg-bg-sunken"
        aria-hidden="true"
      />
      <span
        className="block h-3 w-[64px] animate-pulse rounded bg-bg-sunken"
        aria-hidden="true"
      />
      <span
        className="mt-1 block h-8 w-[112px] animate-pulse rounded-md bg-bg-sunken"
        aria-hidden="true"
      />
    </div>
  );
}
