"use client";

import { TriangleAlert, X } from "lucide-react";
import { formatPrice } from "@vp-parts-shop/shared";
import {
  ArticleIdentity,
  ArticleThumbnail,
  BrandLogo,
  RowCell,
} from "@/components/catalog/article-row";
import { Checkbox } from "@/components/common/checkbox";
import { QuantityStepper } from "@/components/common/quantity-stepper";
import { articleDetailHref } from "@/lib/catalog/links/article-href";
import type { CartLineIssue, CartRowModel } from "@/lib/cart/cart-totals";
import { cn } from "@/lib/utils";
import { CartRowDelivery } from "./cart-row-delivery";

interface CartRowProps {
  row: CartRowModel;
  onQuantityChange: (quantity: number) => void;
  onToggleSelected: () => void;
  onRemove: () => void;
}

/**
 * One cart line, built from the same parts as a catalog row — the thumbnail,
 * the identity block and the brand mark are the components the search list
 * renders — with what a cart adds: a checkbox for whether to order it, a
 * quantity, a unit price and a line total.
 *
 * Live price and delivery come from the page's availability read rather than
 * from the stored line, so a part that sold out or changed price since it was
 * added says so here instead of at payment.
 *
 * Lays out from `--container-cart-wide`, which is provided by the list rather
 * than by the line, so every line switches layout together with the column
 * headings above them.
 */
export function CartRow({
  row,
  onQuantityChange,
  onToggleSelected,
  onRemove,
}: CartRowProps) {
  const { line, availability, unitPriceIncVat, lineTotalIncVat } = row;
  const href = articleDetailHref(line.brandId, line.articleNumber);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[12px] border bg-bg-card transition-colors",
        line.isSelected
          ? "border-line hover:border-ink-3"
          : "border-dashed border-line-2",
      )}
      aria-busy={availability === undefined}
    >
      {/* Once the line lays out as a table the column labels each cell carries
          go `sr-only` rather than away: `CartListHeader` prints them once above
          the list, but those headings are a sibling grid with no association to
          the cells, so dropping the labels would leave a screen reader reading
          this line as four bare numbers. */}
      <div
        className={cn(
          "grid grid-cols-[18px_44px_minmax(0,1fr)_auto_24px] items-start gap-x-3.5 gap-y-3 p-3 @cart-wide:grid-cols-[18px_44px_minmax(120px,1fr)_68px_150px_84px_84px_104px_24px] @cart-wide:items-center @cart-wide:gap-x-3 @cart-wide:px-4 @cart-wide:py-[13px] @cart-wide:[&_[data-cell-label]]:sr-only",
          // A deselected line stays legible but recedes: it is still in the
          // cart, it is simply not part of this order.
          !line.isSelected && "opacity-60",
        )}
      >
        <Checkbox
          checked={line.isSelected}
          onChange={onToggleSelected}
          label={`Избери ${line.articleNumber}`}
          className="row-start-1 mt-3 @cart-wide:mt-0"
        />

        <ArticleThumbnail href={href} thumbnailUrl={line.thumbnailUrl} />

        <ArticleIdentity
          href={href}
          articleNumber={line.articleNumber}
          description={line.description}
        />

        <BrandLogo brandName={line.brandName} brandLogoUrl={line.brandLogoUrl} />

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Премахни ${line.articleNumber} от кошницата`}
          className="col-start-5 row-start-1 grid h-6 w-6 place-items-center rounded-md text-ink-4 transition-colors hover:bg-bg-sunken hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent @cart-wide:col-start-9"
        >
          <X className="h-[15px] w-[15px]" aria-hidden="true" />
        </button>

        <div className="col-span-5 grid grid-cols-2 items-start gap-x-3.5 gap-y-3 border-t border-line pt-3 @cart-wide:col-span-4 @cart-wide:col-start-5 @cart-wide:row-start-1 @cart-wide:grid-cols-subgrid @cart-wide:items-center @cart-wide:border-0 @cart-wide:pt-0">
          <CartRowDelivery
            availability={availability}
            articleNumber={line.articleNumber}
            articleName={line.description}
            quantity={line.quantity}
          />

          <RowCell title="Количество">
            <QuantityStepper
              value={line.quantity}
              max={row.maxQuantity}
              onChange={onQuantityChange}
              itemLabel={line.articleNumber}
            />
          </RowCell>

          <LinePrice
            title="Ед. цена"
            price={unitPriceIncVat}
            isPending={availability === undefined}
            priceChange={row.priceChange}
          />

          <LinePrice
            title="Общо с ДДС"
            price={lineTotalIncVat}
            isPending={availability === undefined}
            emphasis
          />
        </div>

        {row.issue && (
          <CartRowIssue
            issue={row.issue}
            availableQuantity={row.availableQuantity}
          />
        )}
      </div>
    </article>
  );
}

/**
 * Says what the live read found wrong with the line. The quantity itself is
 * left exactly as the customer set it: a cart that quietly rewrites a number
 * hides the very thing they need to decide about.
 */
function CartRowIssue({
  issue,
  availableQuantity,
}: {
  issue: CartLineIssue;
  availableQuantity: number | null;
}) {
  return (
    <p
      data-testid="cart-row-issue"
      className="col-span-full flex items-center gap-1.5 rounded-md bg-danger/8 px-2.5 py-1.5 text-[11.5px] font-medium text-danger"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {issue === "unavailable"
        ? "Артикулът вече не е наличен."
        : `Налични са само ${availableQuantity} бр.`}
    </p>
  );
}

/**
 * One of the line's two money columns. A price we do not have yet is a
 * skeleton and one we could not get is a dash — neither is ever rendered as a
 * zero, which in a cart reads as "free".
 */
function LinePrice({
  title,
  price,
  isPending,
  emphasis,
  priceChange,
}: {
  title: string;
  price: number | null;
  isPending: boolean;
  emphasis?: boolean;
  /** How far this price has moved since the part went in; null if it has not. */
  priceChange?: number | null;
}) {
  return (
    <RowCell title={title} className="@cart-wide:text-right">
      {isPending ? (
        <span
          data-testid="cart-row-price-skeleton"
          className="block h-[18px] w-[68px] animate-pulse rounded bg-bg-sunken @cart-wide:ml-auto"
          aria-hidden="true"
        />
      ) : (
        <>
          <p
            className={cn(
              "whitespace-nowrap font-display tabular-nums",
              emphasis
                ? "text-[17px] font-semibold text-ink"
                : "text-sm font-medium text-ink-2",
            )}
          >
            {price != null ? formatPrice(price) : "—"}
          </p>

          {priceChange != null && <PriceChangeNote change={priceChange} />}
        </>
      )}
    </RowCell>
  );
}

/**
 * That the price has moved since the part went into the cart.
 *
 * Said quietly and beside the live figure, never instead of it: the price on
 * screen is always the one we are selling at today, and the note exists so a
 * customer who remembers a different number is not left wondering.
 */
function PriceChangeNote({ change }: { change: number }) {
  const hasRisen = change > 0;

  return (
    <p
      className={cn(
        "mt-0.5 whitespace-nowrap text-[11.5px] font-medium tabular-nums",
        hasRisen ? "text-warn" : "text-ok",
      )}
    >
      {hasRisen ? "↑" : "↓"} {formatPrice(Math.abs(change))}{" "}
      {hasRisen ? "по-скъпо" : "по-евтино"} от добавянето
    </p>
  );
}
