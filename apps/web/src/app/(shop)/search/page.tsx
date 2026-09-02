import { redirect } from "next/navigation";
import { searchArticles } from "@/lib/api/search";
import {
  buildSearchUrl,
  isNarrowedSearch,
  isPageOutOfRange,
  parseSearchUrl,
  SEARCH_PAGE_SIZE,
  toSearchRequest,
  withPage,
} from "@/lib/catalog/search-url";
import { SearchResultsAvailability } from "@/components/catalog/search/search-results-availability";
import { SearchBreadcrumbs } from "@/components/catalog/search/search-breadcrumbs";
import { SearchEmptyState } from "@/components/catalog/search/search-empty-state";
import { SearchNoMatches } from "@/components/catalog/search/search-no-matches";
import {
  SearchFiltersSidebar,
  SearchPagination,
  SearchPaginationCompact,
} from "@/components/catalog/search/filters";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Filters are URL state and the search is server-rendered, so every selection
 * is a navigation that re-runs the search. That is what keeps the sidebar's
 * counts describing the results actually on screen — filtering a list already
 * fetched would leave them describing the unfiltered set.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const state = parseSearchUrl(await searchParams);

  if (!state.query) {
    return (
      <div className="page-container py-8">
        <SearchEmptyState state={state} />
      </div>
    );
  }

  const response = await searchArticles(toSearchRequest(state));

  // A query that matches nothing at all is a dead end worth its own recovery
  // page. A query emptied by a narrowing is not — that one keeps the sidebar,
  // because the way out is to drop the narrowing rather than retype.
  if (response.total === 0 && !isNarrowedSearch(state)) {
    return (
      <div className="page-container py-8">
        <SearchEmptyState state={state} suggestions={response.suggestions} />
      </div>
    );
  }

  // `maxPage` is only knowable from a response, so an out-of-range page has to
  // be spent to learn it — but it is spent once, and the visitor lands on a
  // page that exists rather than on empty results blamed on their filters.
  if (isPageOutOfRange(state, response.maxPage)) {
    redirect(buildSearchUrl(withPage(state, response.maxPage)));
  }

  return (
    <div className="page-container py-8">
      <SearchBreadcrumbs
        state={state}
        facets={response.facets}
        categoryNavigation={response.categoryNavigation}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
        <SearchFiltersSidebar
          state={state}
          total={response.total}
          facets={response.facets}
          attributes={response.attributes}
          categoryNavigation={response.categoryNavigation}
        />

        <main className="min-w-0">
          {response.results.length > 0 ? (
            <SearchResultsAvailability
              state={state}
              results={response.results}
              total={response.total}
              ordering={response.ordering}
              isRankable={response.isRankable}
              stockScopeCounts={response.stockScopeCounts}
              pager={
                <SearchPaginationCompact
                  state={state}
                  maxPage={response.maxPage}
                />
              }
            />
          ) : (
            <SearchNoMatches state={state} />
          )}

          <SearchPagination
            state={state}
            total={response.total}
            pageSize={response.pageSize || SEARCH_PAGE_SIZE}
            maxPage={response.maxPage}
          />
        </main>
      </div>
    </div>
  );
}
