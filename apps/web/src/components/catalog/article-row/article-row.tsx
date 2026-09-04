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
import { CopyButton } from "@/components/common/copy-button";
import { Tooltip } from "@/components/common/tooltip";
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
 * every list surface — search hits, and the substitutes a row expands into —
 * though the listing grid still uses `ArticleCard`.
 *
 * The collapsed row renders from catalog metadata alone. Live price/stock
 * arrives on its own schedule via `availability`, which lets a cacheable catalog
 * response paint immediately instead of blocking the whole list on the
 * inventory read; the expander's sections are the only other reads, and each
 * waits until a visitor opens it.
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

          <div className="flex min-w-0 flex-col gap-[3px]">
            <div className="flex min-w-0 items-center gap-1">
              <Link
                href={href}
                className="truncate font-mono text-[14.5px] font-semibold tracking-[-0.01em] text-ink hover:underline"
              >
                {articleNumber}
              </Link>
              <CopyButton
                value={articleNumber}
                label={`Копирай номер ${articleNumber}`}
                size="sm"
                className="-my-1"
              />
            </div>
            {/* Clamped rather than wrapped freely: the row's height is pinned by
                the buy column, and a third description line would push past it. */}
            <p
              className="line-clamp-2 text-[12.5px] font-medium text-ink-2"
              title={description}
            >
              {description}
            </p>
            {specSummary && (
              <p className="truncate font-mono text-[11px] text-ink-3">
                {specSummary}
              </p>
            )}
          </div>

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
        />
      )}
    </article>
  );
}

/**
 * The row's part photo, in a square slot the whole list shares.
 *
 * Supplier photos are almost never square — the tall ones are filters, the wide
 * ones brake discs — so `object-contain` letterboxes most of them rather than
 * crop a part a mechanic is trying to recognise. That makes the slot's own
 * backdrop visible down the sides of the image, which is why it is the card
 * colour behind a photo and framed like the brand cell beside it: TecDoc images
 * are white-backed, so they read edge to edge instead of sitting in grey bands.
 * The sunken fill belongs to the empty state, where there is nothing to letterbox.
 */
function ArticleThumbnail({
  href,
  thumbnailUrl,
}: {
  href: string;
  thumbnailUrl: string | null;
}) {
  const [hasFailed, setHasFailed] = useState(false);
  const photoUrl = hasFailed ? null : thumbnailUrl;

  return (
    <Link
      href={href}
      // The article number next to it is the accessible link to the same page;
      // this one is decorative, so keep it out of the tab order.
      tabIndex={-1}
      aria-hidden="true"
      data-testid="article-row-thumbnail"
      className={cn(
        "relative block h-11 w-11 shrink-0 overflow-hidden rounded-md",
        photoUrl ? "border border-line bg-bg-card" : "bg-bg-sunken",
      )}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
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
 *
 * The logo carries the brand name in a tooltip: a mark alone is not a name, and
 * the row has no room to print one beside it.
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
      <Tooltip label={brandName}>
        <span className="relative block h-[34px] w-[56px] rounded-md border border-line bg-bg-card @row-split:h-[42px] @row-split:w-[68px]">
          <Image
            src={brandLogoUrl}
            alt={brandName}
            fill
            className="object-contain p-1"
            sizes="68px"
            onError={() => setHasFailed(true)}
          />
        </span>
      </Tooltip>
    );
  }

  // No tooltip on the wordmark: it already prints the name the tooltip would
  // repeat.

  return (
    <span className="grid h-[34px] w-[56px] place-items-center break-words rounded-md border border-line bg-bg-card px-[5px] py-[3px] text-center font-display text-[10.5px] font-bold leading-[1.1] tracking-[0.02em] text-ink-2 @row-split:h-[42px] @row-split:w-[68px]">
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
