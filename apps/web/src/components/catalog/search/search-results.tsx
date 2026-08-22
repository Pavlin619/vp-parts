import type {
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
} from "@vp-parts-shop/shared";
import { ArticleRow } from "@/components/catalog/article-row";
import { selectArticleAvailability } from "@/lib/catalog/merge-availability";

/** A search hit — the catalog metadata TecDoc owns, with no live inventory. */
export type SearchResultRow = ArticleSummaryDto;

interface SearchResultsProps {
  query: string;
  results: SearchResultRow[];
  /**
   * Every match the API found, which is not `results.length` — the search
   * endpoint pages its hits.
   */
  total: number;
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
  query,
  results,
  total,
  availability,
}: SearchResultsProps) {
  return (
    <section aria-label="Резултати от търсенето">
      <h1 className="mb-1 text-xl font-semibold text-ink">
        Резултати за „{query}“
      </h1>
      {/* The match count only; which slice of it is on screen is the pager's
          line, so the two never disagree. */}
      <p className="mb-6 text-sm text-muted">{total} намерени части</p>

      <ul className="flex flex-col gap-2" aria-busy={availability === undefined}>
        {results.map((result) => (
          <li key={`${result.brandId}-${result.articleNumber}`}>
            <ArticleRow
              article={result}
              availability={selectArticleAvailability(
                availability,
                result.articleNumber,
              )}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
