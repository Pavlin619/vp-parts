"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ImageOff } from "lucide-react";
import type {
  ArticleSummaryDto,
  TechnicalSpecDto,
  WarehouseAvailabilityDto,
} from "@vp-parts-shop/shared";
import { useBuyBoxQuantity } from "@/hooks/use-buy-box-quantity";
import { articleDetailHref } from "@/lib/catalog/article-href";
import type { RowAvailability } from "@/lib/catalog/merge-availability";
import { cn } from "@/lib/utils";
import { ArticleRowAvailability } from "./article-row-availability";
import { ArticleRowBuy } from "./article-row-buy";
import { ArticleRowDetail } from "./article-row-detail";

interface ArticleRowProps {
  /** TecDoc catalog metadata — everything the search/listing response carries. */
  article: ArticleSummaryDto;
  /**
   * Live price and stock, fetched separately from the catalog metadata. Leave
   * it `undefined` while that read is in flight and the inventory columns
   * render skeletons; pass `null` if it failed. See {@link RowAvailability}.
   */
  availability?: RowAvailability;
  onAddToCart?: (articleNumber: string, quantity: number) => void;
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
 * and the buy action, with an expander for the technical detail. Built to back
 * every list surface, but only search renders it so far — the listing grid and
 * substitutes still use `ArticleCard`.
 *
 * The collapsed row renders from catalog metadata alone. Live price/stock
 * arrives on its own schedule via `availability`, which lets a cacheable catalog
 * response paint immediately instead of blocking the whole list on the
 * inventory read; the expander's applicable-vehicles section is the only other
 * read, and it waits until a visitor opens it.
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
  onAddToCart,
}: ArticleRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const quantity = useBuyBoxQuantity(
    availability?.availabilityByWarehouse ?? NO_WAREHOUSES,
  );

  const { articleNumber, brandId, brandName, description } = article;
  const href = articleDetailHref(brandId, articleNumber);
  const specSummary = formatSpecSummary(article.technicalSpecs);

  return (
    <article
      className="overflow-hidden rounded-[12px] border border-line bg-bg-card transition-colors hover:border-ink-3"
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

        <div className="grid min-w-0 flex-1 grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 p-3 lg:grid-cols-[44px_minmax(150px,1fr)_68px_116px_142px_152px] lg:px-4 lg:py-[13px]">
          <ArticleThumbnail href={href} thumbnailUrl={article.thumbnailUrl} />

          <div className="flex min-w-0 flex-col gap-[3px]">
            <Link
              href={href}
              className="font-mono text-[14.5px] font-semibold tracking-[-0.01em] text-ink hover:underline"
            >
              {articleNumber}
            </Link>
            <p className="text-[12.5px] font-medium text-ink-2">{description}</p>
            {specSummary && (
              <p className="truncate font-mono text-[11px] text-ink-3">
                {specSummary}
              </p>
            )}
          </div>

          {/* The metadata columns wrap under the identity block on narrow
              viewports, so they start their own grid row there. Each cell centres
              as a whole — label included — so a label always sits directly above
              the value it describes rather than on a shared header line. */}
          <div className="col-span-2 grid grid-cols-2 items-center gap-x-3.5 gap-y-3 border-t border-line pt-3 lg:col-span-4 lg:grid-cols-subgrid lg:border-0 lg:pt-0">
            <BrandLogo brandName={brandName} brandLogoUrl={article.brandLogoUrl} />

            <ArticleRowAvailability
              availability={availability}
              articleNumber={articleNumber}
              articleName={description}
              quantity={quantity.selectedQuantity}
            />

            <ArticleRowBuy
              availability={availability}
              quantity={quantity}
              articleName={description}
              onAddToCart={(selected) => onAddToCart?.(articleNumber, selected)}
            />
          </div>
        </div>
      </div>

      {isExpanded && (
        <ArticleRowDetail
          brandId={brandId}
          articleNumber={articleNumber}
          technicalSpecs={article.technicalSpecs}
          oemNumbers={article.oemNumbers}
        />
      )}
    </article>
  );
}

function ArticleThumbnail({
  href,
  thumbnailUrl,
}: {
  href: string;
  thumbnailUrl: string | null;
}) {
  const [hasFailed, setHasFailed] = useState(false);

  return (
    <Link
      href={href}
      // The article number next to it is the accessible link to the same page;
      // this one is decorative, so keep it out of the tab order.
      tabIndex={-1}
      aria-hidden="true"
      className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-md bg-bg-sunken"
    >
      {thumbnailUrl && !hasFailed ? (
        <Image
          src={thumbnailUrl}
          alt=""
          fill
          className="object-contain"
          sizes="44px"
          onError={() => setHasFailed(true)}
        />
      ) : (
        // The brand logo sits in the very next column, so the placeholder stays
        // wordless rather than printing the brand name twice.
        <span className="grid h-full w-full place-items-center text-ink-4">
          <ImageOff className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </Link>
  );
}

/**
 * The brand cell. A logo that fails to load is treated as no logo at all — the
 * wordmark fallback says more than an empty frame, and a TecDoc image host we
 * have not registered in `next.config.ts` fails exactly this way.
 */
function BrandLogo({
  brandName,
  brandLogoUrl,
}: {
  brandName: string;
  brandLogoUrl: string | null;
}) {
  const [hasFailed, setHasFailed] = useState(false);

  if (brandLogoUrl && !hasFailed) {
    return (
      <span className="relative block h-[42px] w-[68px] rounded-md border border-line bg-bg-card">
        <Image
          src={brandLogoUrl}
          alt={brandName}
          fill
          className="object-contain p-1"
          sizes="68px"
          onError={() => setHasFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className="grid h-[42px] place-items-center break-words rounded-md border border-line bg-bg-card px-[5px] py-[3px] text-center font-display text-[10.5px] font-bold leading-[1.1] tracking-[0.02em] text-ink-2">
      {brandName}
    </span>
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
