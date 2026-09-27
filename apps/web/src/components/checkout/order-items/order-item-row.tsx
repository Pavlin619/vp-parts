import { formatPrice } from "@vp-parts-shop/shared";
import { ArticleThumbnail } from "@/components/catalog/article-row";
import { articleDetailHref } from "@/lib/catalog/links/article-href";
import type { CartRowModel } from "@/lib/cart/cart-totals";

/** One line of the order as checkout recaps it: what, how many, for how much. */
export function OrderItemRow({ row }: { row: CartRowModel }) {
  const { line, availability, lineTotalIncVat } = row;
  const isPending = availability === undefined;

  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_auto_auto] items-center gap-2.5">
      <ArticleThumbnail
        href={articleDetailHref(line.brandId, line.articleNumber)}
        thumbnailUrl={line.thumbnailUrl}
      />

      <div className="min-w-0">
        <p className="font-mono text-xs font-semibold text-ink">{line.articleNumber}</p>
        <p className="truncate text-[11.5px] text-ink-3">{line.description}</p>
      </div>

      <span className="font-display text-xs font-semibold text-ink-3">
        ×{line.quantity}
      </span>

      {isPending ? (
        <span
          data-testid="order-item-price-skeleton"
          className="block h-4 w-[56px] animate-pulse rounded bg-bg-sunken"
          aria-hidden="true"
        />
      ) : (
        <span className="whitespace-nowrap font-display text-[13px] font-semibold tabular-nums text-ink">
          {lineTotalIncVat != null ? formatPrice(lineTotalIncVat) : "—"}
        </span>
      )}
    </div>
  );
}
