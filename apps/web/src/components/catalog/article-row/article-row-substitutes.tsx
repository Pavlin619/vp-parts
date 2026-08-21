"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ArticleSummaryDto } from "@vp-parts-shop/shared";
import {
  availabilityQueryOptions,
  substitutesQueryOptions,
} from "@/lib/api/catalog";
import { selectArticleAvailability } from "@/lib/catalog/merge-availability";
import { ArticleRow } from "./article-row";
import { SectionLoadError } from "./section-load-error";

interface ArticleRowSubstitutesProps {
  articleNumber: string;
}

/**
 * The substitutes section of a catalog row: the same part from other brands,
 * each as a catalog row of its own — priced, in stock and buyable, so a visitor
 * whose part is on back order can switch brand without leaving the list.
 *
 * Not brand-scoped, unlike the applicable-vehicles section beside it. TecDoc
 * resolves these through a comparable-number search, which takes the number as
 * its query rather than as an identity; the section shares that one read (and
 * so its cache) with the alternative-numbers chips.
 */
export function ArticleRowSubstitutes({
  articleNumber,
}: ArticleRowSubstitutesProps) {
  const { data, isPending, isError, refetch } = useQuery(
    substitutesQueryOptions(articleNumber),
  );

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

  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-2 bg-canvas p-5 text-[13px] text-ink-3">
        Няма заменяеми части за този артикул.
      </p>
    );
  }

  return <SubstituteRows substitutes={data} />;
}

/**
 * Prices the substitutes and lists them. Split from the read above so the
 * availability request is issued for the numbers that actually came back, and
 * only once they have — the section itself must cost nothing until opened.
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
