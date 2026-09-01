import type { ReactNode } from "react";
import type {
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
  SearchOrdering,
  StockScopeCountsDto,
} from "@vp-parts-shop/shared";
import { ArticleRow } from "@/components/catalog/article-row";
import { selectArticleAvailability } from "@/lib/catalog/merge-availability";
import type { SearchUrlState } from "@/lib/catalog/search-url";
import { SearchResultsHeader } from "./search-results-header";

/** A search hit — the catalog metadata TecDoc owns, with no live inventory. */
export type SearchResultRow = ArticleSummaryDto;

interface SearchResultsProps {
  /** The URL the header's controls navigate from. */
  state: SearchUrlState;
  results: SearchResultRow[];
  /**
   * Every match the API found after the stock narrowing, which is not
   * `results.length` — the search endpoint pages its hits.
   */
  total: number;
  /**
   * What the row order means — whether the match set was narrow enough for the
   * API to rank it by what we can ship.
   */
  ordering: SearchOrdering;
  /** Per-origin stock, when the API had the whole set and its stock to count. */
  stockScopeCounts?: StockScopeCountsDto;
  /**
   * The compact pager shown beside the count. Passed in as a slot rather than
   * built here so it renders on the server: this component's caller is a client
   * boundary, and the pager needs nothing from it.
   */
  pager?: ReactNode;
  /**
   * Live price/stock keyed by article number. `undefined` while the separate
   * availability read is in flight (rows show skeletons in those columns) and
   * `null` when it failed.
   */
  availability?: ArticlesAvailabilityDto | null;
}

/**
 * The search hit list. Rows paint from the cacheable catalog response alone; the
 * live inventory columns fill in as the separate availability read lands, so a
 * slow inventory query never holds back the part data we already have.
 *
 * Not a client boundary of its own: it holds no state and only lays out rows, so
 * it can be rendered from either side. Today its caller is a client component
 * (it owns the availability query), which is what puts this in the browser.
 */
export function SearchResults({
  state,
  results,
  total,
  ordering,
  stockScopeCounts,
  pager,
  availability,
}: SearchResultsProps) {
  return (
    <section aria-label="Резултати от търсенето">
      <SearchResultsHeader
        state={state}
        total={total}
        ordering={ordering}
        stockScopeCounts={stockScopeCounts}
        pager={pager}
      />

      <ul
        className="flex flex-col gap-2"
        aria-busy={availability === undefined}
      >
        {results.map((result) => (
          <li key={`${result.brandId}-${result.articleNumber}`}>
            <ArticleRow
              article={result}
              availability={selectArticleAvailability(availability, result)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
