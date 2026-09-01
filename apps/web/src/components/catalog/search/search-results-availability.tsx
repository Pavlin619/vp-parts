"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ArticleSummaryDto,
  SearchOrdering,
  StockScopeCountsDto,
} from "@vp-parts-shop/shared";
import { availabilityQueryOptions } from "@/lib/api/catalog";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import type { SearchUrlState } from "@/lib/catalog/search-url";
import { SearchResults } from "./search-results";

interface SearchResultsAvailabilityProps {
  /** The URL state the results header's controls navigate from. */
  state: SearchUrlState;
  /** Search hits as TecDoc catalog summaries; live availability is fetched here. */
  results: ArticleSummaryDto[];
  /** Every match the API found, not just the hits on this page. */
  total: number;
  /** What the row order means; passed straight through to the results. */
  ordering: SearchOrdering;
  /** Per-origin stock over the whole set; passed straight through. */
  stockScopeCounts?: StockScopeCountsDto;
  /** Server-rendered compact pager, passed straight through to the results. */
  pager?: ReactNode;
}

/**
 * Fetches live price/availability for the search hits client-side. The search
 * endpoint returns cacheable catalog metadata only, so this keeps request-time
 * delivery/stock off the (cacheable) search response.
 *
 * The hits render immediately from that metadata — only each row's inventory
 * columns wait on this read. The bulk read fails closed (503), so a transient
 * failure degrades to a scoped retry above a still-usable list rather than
 * hiding the results or showing every hit as falsely out of stock.
 *
 * A failed *refetch* keeps the prices already on screen — the retry prompt says
 * they may be stale, which beats blanking figures the visitor can see.
 */
export function SearchResultsAvailability({
  state,
  results,
  total,
  ordering,
  stockScopeCounts,
  pager,
}: SearchResultsAvailabilityProps) {
  const { data, isError, refetch } = useQuery(
    availabilityQueryOptions(results),
  );

  return (
    <>
      {isError && (
        <AvailabilityLoadError
          onRetry={() => refetch()}
          title={
            data
              ? "Показаните наличности може да не са актуални."
              : "В момента не можем да заредим наличността на резултатите."
          }
          className="mb-6 rounded-[12px] border border-line bg-bg-card py-6"
        />
      )}

      <SearchResults
        state={state}
        results={results}
        total={total}
        ordering={ordering}
        stockScopeCounts={stockScopeCounts}
        pager={pager}
        availability={data ?? (isError ? null : undefined)}
      />
    </>
  );
}
