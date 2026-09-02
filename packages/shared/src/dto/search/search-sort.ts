/**
 * The order a visitor asked a result list for, and — echoed back as the
 * response's `ordering` — the order the list is actually in. One vocabulary for
 * both directions on purpose: a request value the response cannot express would
 * be a promise with no way to say it was not kept.
 *
 * - `availability` (default) — what we can ship: in stock first, then fastest
 *   delivery band and lowest price.
 * - `price_asc` / `price_desc` — cheapest or dearest first, still in stock
 *   first. A list that puts an unstocked part above a stocked one is sorted by
 *   a price nobody can pay.
 * - `brand` / `article_number` — the catalogue's own alphabetical axes.
 * - `catalogue` — TecDoc's own relevance order.
 *
 * Lives here rather than in either app because it is the wire contract: the web
 * app puts it in the `/search` URL and the API validates the same values.
 */
export const SearchSort = {
  Availability: 'availability',
  PriceAscending: 'price_asc',
  PriceDescending: 'price_desc',
  Brand: 'brand',
  ArticleNumber: 'article_number',
  Catalogue: 'catalogue',
} as const;

export type SearchSort = (typeof SearchSort)[keyof typeof SearchSort];

export const SEARCH_SORTS: readonly SearchSort[] = Object.values(SearchSort);

export const DEFAULT_SEARCH_SORT: SearchSort = SearchSort.Availability;

export function isSearchSort(value: unknown): value is SearchSort {
  return SEARCH_SORTS.includes(value as SearchSort);
}

/**
 * Whether answering this sort needs the whole match set enumerated and its
 * stock read. Only these two rank on something no catalogue knows, so only
 * these two are unavailable once a set is too wide to enumerate — which is what
 * lets the client offer a sort menu without repeating the API's tiering rule.
 */
export function requiresRankedSet(sort: SearchSort): boolean {
  return (
    sort === SearchSort.Availability ||
    sort === SearchSort.PriceAscending ||
    sort === SearchSort.PriceDescending
  );
}

/**
 * The sort to fall back to when {@link requiresRankedSet} cannot be honoured.
 * A wide set has no stock to rank on, and serving it silently in catalogue
 * order under an `availability` label is the one thing the shared vocabulary
 * exists to prevent.
 */
export function sortForUnrankableSet(sort: SearchSort): SearchSort {
  return requiresRankedSet(sort) ? SearchSort.Catalogue : sort;
}
