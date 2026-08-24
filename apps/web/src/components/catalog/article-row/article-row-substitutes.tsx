"use client";

import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { ArticleSummaryDto } from "@vp-parts-shop/shared";
import {
  availabilityQueryOptions,
  substitutesQueryOptions,
} from "@/lib/api/catalog";
import { selectArticleAvailability } from "@/lib/catalog/merge-availability";
import { ArticleRow } from "./article-row";
import { SectionLoadError } from "./section-load-error";

interface ArticleRowSubstitutesProps {
  /** TecDoc brand id; which parts replace a part is a property of that part. */
  brandId: string;
  articleNumber: string;
}

/**
 * The substitutes section of a catalog row: the other brands' parts replacing
 * this one, each as a catalog row of its own — priced, in stock and buyable, so
 * a visitor whose part is on back order can switch brand without leaving the
 * list.
 *
 * Every alternative is reachable rather than a truncated few, a page at a time:
 * the API orders the whole set by what we can ship before paging it, so the
 * first page is the one worth reading and "show more" is for the visitor who
 * wants the rest.
 *
 * Brand-scoped like the applicable-vehicles section beside it, and sharing its
 * one cross-reference read — and so its cache — with the alternative-numbers
 * chips.
 */
export function ArticleRowSubstitutes({
  brandId,
  articleNumber,
}: ArticleRowSubstitutesProps) {
  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(substitutesQueryOptions(brandId, articleNumber));

  if (isPending) {
    return <SubstitutesSkeleton />;
  }

  if (isError) {
    return (
      <SectionLoadError
        message="В момента не можем да заредим заменяемите части."
        onRetry={() => refetch()}
      />
    );
  }

  const total = data.pages[data.pages.length - 1].total;

  if (total === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-2 bg-canvas p-5 text-[13px] text-ink-3">
        Няма заменяеми части за този артикул.
      </p>
    );
  }

  const shown = data.pages.reduce((count, page) => count + page.items.length, 0);

  return (
    <div className="flex flex-col gap-3">
      {/* One group per fetched page, each pricing its own numbers: the
          availability endpoint takes one page's worth of numbers at a time. */}
      {data.pages.map((page) => (
        <SubstituteRows key={page.page} substitutes={page.items} />
      ))}

      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-md border border-line-2 px-4 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        >
          {isFetchingNextPage && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          Покажи още ({total - shown})
        </button>
      )}
    </div>
  );
}

/**
 * Prices one page of substitutes and lists them. Split from the read above so
 * the availability request is issued for the numbers that actually came back,
 * and only once they have — the section itself must cost nothing until opened.
 * Per page rather than for everything shown, so a batch stays inside the
 * availability endpoint's limit however many pages a visitor asks for.
 *
 * These are ordinary catalog rows, expander included: comparing a substitute
 * against the part you came for is exactly what its specs and applicable
 * vehicles are for. A nested row therefore offers a substitutes section of its
 * own, and a visitor may keep going as deep as they care to — every level is a
 * click they asked for, and each read is cached.
 */
function SubstituteRows({ substitutes }: { substitutes: ArticleSummaryDto[] }) {
  const articleNumbers = useMemo(
    () => substitutes.map((substitute) => substitute.articleNumber),
    [substitutes],
  );

  const { data, isError, refetch } = useQuery(
    availabilityQueryOptions(articleNumbers),
  );

  // A failed refetch keeps the prices already on screen; only a first read that
  // never landed leaves the rows with nothing, and they say so rather than
  // reading as "out of stock".
  const availability = data ?? (isError ? null : undefined);

  return (
    <div className="flex flex-col gap-3">
      {isError && (
        <SectionLoadError
          message={
            data
              ? "Показаните наличности може да не са актуални."
              : "В момента не можем да заредим наличността на заменяемите части."
          }
          onRetry={() => refetch()}
        />
      )}

      <ul className="flex flex-col gap-2">
        {substitutes.map((substitute) => (
          <li key={`${substitute.brandId}-${substitute.articleNumber}`}>
            <ArticleRow
              article={substitute}
              availability={selectArticleAvailability(
                availability,
                substitute.articleNumber,
              )}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubstitutesSkeleton() {
  return (
    <div
      className="flex flex-col gap-2"
      data-testid="article-row-substitutes-skeleton"
      aria-busy="true"
    >
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="h-[70px] animate-pulse rounded-[12px] border border-line bg-bg-sunken"
        />
      ))}
    </div>
  );
}
