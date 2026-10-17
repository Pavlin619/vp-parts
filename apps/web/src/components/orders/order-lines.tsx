import Link from "next/link";
import { formatPrice, type OrderItemDto } from "@vp-parts-shop/shared";
import { ArticleThumbnail } from "@/components/catalog/article-row";
import { articleDetailHref } from "@/lib/catalog/links/article-href";

/** What was ordered, at the prices the order was placed at. */
export function OrderLines({ items }: { items: OrderItemDto[] }) {
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);

  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Поръчани артикули · {itemCount}
      </h2>

      <ul aria-label="Поръчани артикули" className="divide-y divide-line">
        {items.map((item) => (
          <OrderLine key={`${item.brandId}-${item.articleNumber}`} item={item} />
        ))}
      </ul>
    </section>
  );
}

function OrderLine({ item }: { item: OrderItemDto }) {
  const href = articleDetailHref(item.brandId, item.articleNumber);

  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[44px_minmax(0,1fr)_auto_96px] sm:gap-x-3.5">
      <div className="max-sm:row-span-2">
        <ArticleThumbnail href={href} thumbnailUrl={item.thumbnailUrl} />
      </div>

      <div className="min-w-0 max-sm:col-span-2">
        <p className="font-mono text-[12.5px] font-semibold text-ink">
          <Link href={href} className="hover:text-accent-hover">
            {item.articleNumber}
          </Link>
          <span className="ml-1 font-sans text-[11.5px] font-medium text-ink-4">
            {item.brandName}
          </span>
        </p>
        <p className="mt-0.5 text-[13px] leading-[1.4] text-ink-2">{item.description}</p>
      </div>

      <p className="whitespace-nowrap font-display text-[12.5px] tabular-nums text-ink-3">
        {item.quantity} × {formatPrice(item.unitPrice)}
      </p>
      <p className="whitespace-nowrap text-right font-display text-sm font-semibold tabular-nums text-ink">
        {formatPrice(item.lineTotal)}
      </p>
    </li>
  );
}
