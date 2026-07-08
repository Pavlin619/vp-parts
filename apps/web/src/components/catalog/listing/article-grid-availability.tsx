"use client";

import { useQuery } from "@tanstack/react-query";
import type { PaginatedCatalogArticlesDto } from "@vp-parts-shop/shared";
import { availabilityQueryOptions } from "@/lib/api/catalog";
import { mergeArticleAvailability } from "@/lib/catalog/merge-availability";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { ArticleGrid } from "./article-grid";
import { ArticleGridSkeleton } from "./article-grid-skeleton";

interface ArticleGridAvailabilityProps {
  metadata: PaginatedCatalogArticlesDto;
}

/**
 * Fetches live price/availability for the page's cached metadata client-side
 * and renders the grid with fresh delivery/stock merged in. Shows a skeleton
 * while the read is in flight. The bulk read fails closed (503), so a transient
 * failure degrades to a scoped retry rather than rendering the whole grid as
 * falsely out of stock — the cached metadata (titles, images) is unaffected.
 */
export function ArticleGridAvailability({
  metadata,
}: ArticleGridAvailabilityProps) {
  const numbers = metadata.items.map((item) => item.articleNumber);
  const { data, isPending, isError, refetch } = useQuery(
    availabilityQueryOptions(numbers),
  );

  if (isPending) {
    return <ArticleGridSkeleton count={metadata.items.length || 10} />;
  }

  if (isError) {
    return (
      <AvailabilityLoadError
        onRetry={() => refetch()}
        title="В момента не можем да заредим частите."
      />
    );
  }

  const articles = mergeArticleAvailability(metadata.items, data ?? {});

  return <ArticleGrid articles={articles} total={metadata.total} />;
}
