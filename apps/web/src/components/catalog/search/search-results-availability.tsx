"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ArticleSummaryDto } from "@vp-parts-shop/shared";
import { availabilityQueryOptions } from "@/lib/api/catalog";
import { mergeArticleAvailability } from "@/lib/catalog/merge-availability";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { SearchResults } from "./search-results";

interface SearchResultsAvailabilityProps {
  query: string;
  /** Search hits as TecDoc catalog summaries; live availability is fetched here. */
  results: ArticleSummaryDto[];
}

/**
 * Fetches live price/availability for the search hits client-side and renders
 * the results with fresh stock/price merged in — mirroring the listing grid and
 * substitutes. The search endpoint returns cacheable catalog metadata only, so
 * this keeps request-time delivery/stock off the (cacheable) search response.
 * The bulk read fails closed (503), so a transient failure degrades to a scoped
 * retry rather than showing every hit as falsely out of stock.
 */
export function SearchResultsAvailability({
  query,
  results,
}: SearchResultsAvailabilityProps) {
  const numbers = useMemo(
    () => results.map((result) => result.articleNumber),
    [results],
  );
  const { data, isPending, isError, refetch } = useQuery(
    availabilityQueryOptions(numbers),
  );

  const enriched = useMemo(
    () => (data ? mergeArticleAvailability(results, data) : []),
    [results, data],
  );

  if (isPending) {
    return <SearchResultsSkeleton count={results.length} />;
  }

  if (isError) {
    return (
      <AvailabilityLoadError
        onRetry={() => refetch()}
        title="В момента не можем да заредим наличността на резултатите."
      />
    );
  }

  return <SearchResults query={query} results={enriched} />;
}

/**
 * Placeholder rows shown while the results' live availability streams in.
 * Mirrors the search-row footprint so the list does not jump when data lands.
 */
function SearchResultsSkeleton({ count }: { count: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Зареждане на резултатите"
      className="flex flex-col gap-3"
    >
      {Array.from({ length: count || 6 }).map((_, index) => (
        <div
          key={index}
          className="h-[76px] animate-pulse rounded-[12px] border border-line bg-bg-sunken"
        />
      ))}
    </div>
  );
}
