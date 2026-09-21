"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type {
  ArticleSummaryDto,
  TechnicalSpecDto,
  WarehouseAvailabilityDto,
} from "@vp-parts-shop/shared";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useBuyBoxQuantity } from "@/hooks/use-buy-box-quantity";
import { useCanAddLine } from "@/hooks/use-cart";
import { articleDetailHref } from "@/lib/catalog/links/article-href";
import type { RowAvailability } from "@/lib/inventory/merge-availability";
import { cn } from "@/lib/utils";
import { ArticleIdentity } from "./article-identity";
import { ArticleRowAvailability } from "./article-row-availability";
import { ArticleRowBuy } from "./article-row-buy";
import { ArticleRowDetail } from "./article-row-detail";
import { ArticleThumbnail } from "./article-thumbnail";
import { BrandLogo } from "./brand-logo";

interface ArticleRowProps {
  /** TecDoc catalog metadata — everything the search/listing response carries. */
  article: ArticleSummaryDto;
  /**
   * Live price and stock, fetched separately from the catalog metadata. Leave
   * it `undefined` while that read is in flight and the inventory columns
   * render skeletons; pass `null` if it failed. See {@link RowAvailability}.
   */
  availability?: RowAvailability;
  /**
   * The category the list itself is standing in, carried into the detail URL so
   * the part's breadcrumb continues the trail the visitor drilled rather than
   * picking one of TecDoc's other trails for the same part.
   */
  categoryNodeId?: string;
}

/** Specs shown on the collapsed row; the rest live in the expander. */
const SUMMARY_SPEC_LIMIT = 3;

/**
 * Stands in for the warehouses of a row whose availability has not arrived. It
 * has to be one shared value, not a fresh `[]` per render, or the identity
 * change re-runs the stock rollup {@link useBuyBoxQuantity} memoises.
 */
const NO_WAREHOUSES: WarehouseAvailabilityDto[] = [];

/**
 * One article as a wide catalog row: identity, brand, delivery promise, stock
 * and the buy action, with an expander for the technical detail. Backs every
 * list surface — search hits, and the substitutes a row expands into.
 *
 * The collapsed row renders from catalog metadata alone. Live price/stock
 * arrives on its own schedule via `availability`, which lets a cacheable catalog
 * response paint immediately instead of blocking the whole list on the
 * inventory read; the expander's sections are the only other reads, and each
 * waits until a visitor opens it.
 *
 * The buy action writes straight to the cart rather than reporting up to the
 * list: what "add to cart" means is the same on every list surface, and a
 * handler threaded through each one is a way for them to disagree.
 *
 * Deliberately shows no vehicle-fit verdict even though `ArticleSummaryDto`
 * carries one: list surfaces are vehicle-agnostic, and resolving fit per row
 * would cost a lookup per hit. Fit is rendered only on the article detail page.
 * The applicable-vehicles section is not that verdict — it lists what the part
 * fits, rather than judging it against the visitor's selected vehicle.
 */
export function ArticleRow({
  article,
  availability,
  categoryNodeId,
}: ArticleRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { addToCart, isAddingToCart } = useAddToCart();
  const canAddToCart = useCanAddLine(article);

  const quantity = useBuyBoxQuantity(
    availability?.availabilityByWarehouse ?? NO_WAREHOUSES,
  );

  const { articleNumber, brandId, brandName, description } = article;
  const href = articleDetailHref(brandId, articleNumber, categoryNodeId);
  const specSummary = formatSpecSummary(article.technicalSpecs);

  return (
    <article
      className="@container overflow-hidden rounded-[12px] border border-line bg-bg-card transition-colors hover:border-ink-3"
      aria-busy={availability === undefined}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          aria-label={`Допълнителна информация за ${articleNumber}`}
          className={cn(
            "grid w-[34px] shrink-0 place-items-center border-r border-line text-ink-3 transition-colors hover:bg-bg-sunken hover:text-ink focus-visible:outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-accent",
            isExpanded && "bg-accent-soft text-accent-hover",
          )}
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              isExpanded && "rotate-90",
            )}
            aria-hidden="true"
          />
        </button>

        {/* Six columns once the row is wide enough. Below that the brand keeps a
            column of its own beside the identity block — a mark reads as part of
            the part's name, not as inventory — and the live columns drop to a
            band underneath. */}
        <div className="grid min-w-0 flex-1 grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-x-3.5 gap-y-3 p-3 @row-wide:grid-cols-[44px_minmax(150px,1fr)_68px_116px_142px_152px] @row-wide:items-center @row-wide:px-4 @row-wide:py-[13px]">
          <ArticleThumbnail href={href} thumbnailUrl={article.thumbnailUrl} />

          <ArticleIdentity
            href={href}
            articleNumber={articleNumber}
            description={description}
            meta={specSummary}
          />

          <BrandLogo brandName={brandName} brandLogoUrl={article.brandLogoUrl} />

          {/* The live-inventory columns wrap under the identity block once the
              row is too narrow for one line, and drop the buy actions to a line
              of their own once it is too narrow even for that. On two lines
              delivery and stock keep the widths they have on one, so the slack
              collects in front of the right-aligned price rather than between
              the two of them; an `auto` track anywhere here would misalign the
              list, since every row is its own grid. Each cell centres as a
              whole — label included — so a label always sits directly above the
              value it describes rather than on a shared header line. */}
          <div className="col-span-3 grid grid-cols-2 items-start gap-x-3.5 gap-y-3 border-t border-line pt-3 @row-split:grid-cols-[116px_142px_minmax(0,1fr)] @row-wide:grid-cols-subgrid @row-wide:items-center @row-wide:border-0 @row-wide:pt-0">
            <ArticleRowAvailability
              availability={availability}
              articleNumber={articleNumber}
              articleName={description}
              quantity={quantity.selectedQuantity}
            />

            <ArticleRowBuy
              availability={availability}
              quantity={quantity}
              articleNumber={articleNumber}
              articleName={description}
              canAddToCart={canAddToCart}
              isAddingToCart={isAddingToCart}
              onAddToCart={(selected) =>
                addToCart(
                  {
                    brandId,
                    articleNumber,
                    brandName,
                    brandLogoUrl: article.brandLogoUrl,
                    description,
                    thumbnailUrl: article.thumbnailUrl,
                  },
                  selected,
                  availability?.bestPriceIncVat ?? null,
                )
              }
            />
          </div>
        </div>
      </div>

      {isExpanded && (
        <ArticleRowDetail
          brandId={brandId}
          articleNumber={articleNumber}
          technicalSpecs={article.technicalSpecs}
        />
      )}
    </article>
  );
}

/**
 * The one-line spec summary under the description, e.g.
 * "Височина: 79 mm · Външен диаметър: 93 mm". Kept short so the column never
 * pushes the inventory columns off the row.
 */
function formatSpecSummary(technicalSpecs: TechnicalSpecDto[]): string {
  return technicalSpecs
    .slice(0, SUMMARY_SPEC_LIMIT)
    .map((spec) => `${spec.key}: ${spec.value}`)
    .join(" · ");
}
