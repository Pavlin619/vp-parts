import { infiniteQueryOptions, keepPreviousData } from "@tanstack/react-query";
import {
  DEFAULT_SEARCH_SORT,
  type PaginatedCatalogArticlesDto,
  type SearchSort,
} from "@vp-parts-shop/shared";
import { apiFetch } from "../index";
import { articlePath, ROW_SECTION_CACHE } from "./article-reads";

/**
 * Substitutes fetched per "show more".
 *
 * Kept at or below the availability batch limit, because each page is priced by
 * one availability read of its own numbers.
 */
const SUBSTITUTES_PAGE_SIZE = 20;

/**
 * One page of substitutes — the other brands' parts replacing this one, as
 * cacheable catalog metadata only. Live price/availability is fetched separately
 * via `getArticlesAvailability`, mirroring the search list's metadata /
 * live-availability split.
 *
 * Paged rather than capped: `total` counts every alternative, so the section can
 * offer them all while a page carries only the rows a visitor has reached. The
 * API orders the whole set by what we can ship before paging it, so page 1 is
 * the part most likely to solve the visitor's problem.
 *
 * Brand-scoped like every article-scoped read: which parts replace a part is a
 * property of that part, and two brands filing one number are two parts.
 */
export function getSubstitutes(
  brandId: string,
  articleNumber: string,
  query: { page?: number; sort?: SearchSort } = {},
): Promise<PaginatedCatalogArticlesDto> {
  const { page = 1, sort = DEFAULT_SEARCH_SORT } = query;

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(SUBSTITUTES_PAGE_SIZE),
  });

  if (sort !== DEFAULT_SEARCH_SORT) {
    params.set("sort", sort);
  }

  return apiFetch<PaginatedCatalogArticlesDto>(
    `${articlePath(brandId, articleNumber)}/substitutes?${params}`,
  );
}

/**
 * The same alternatives as `partNumbersQueryOptions`, as whole catalog rows
 * rather than numbers, a page at a time.
 *
 * Infinite rather than a pager: this is a section inside a row a visitor already
 * expanded, so replacing the rows they are reading with a different page would
 * lose their place. Each page also stays its own cache entry, which is what keeps
 * one availability read per page inside the batch limit.
 *
 * Keyed on brand and number together, like the read behind it: which parts
 * replace a part is a property of that part, so a number-only key serves one
 * brand's alternatives to the other. The sort joins them because it reorders
 * the whole set before it is paged, so pages of two sorts are not pages of one
 * list and must not accumulate in one entry.
 */
export const substitutesQueryOptions = (
  brandId: string,
  articleNumber: string,
  sort: SearchSort = DEFAULT_SEARCH_SORT,
) =>
  infiniteQueryOptions({
    queryKey: ["catalog", "substitutes", brandId, articleNumber, sort],
    queryFn: ({ pageParam }) =>
      getSubstitutes(brandId, articleNumber, { page: pageParam, sort }),
    initialPageParam: 1,
    getNextPageParam: nextPageOf,
    // Switching sort changes the key, and without this the section would fall
    // back to its skeleton — taking the sort control a visitor just clicked off
    // the screen with it.
    placeholderData: keepPreviousData,
    ...ROW_SECTION_CACHE,
  });

/**
 * The page after the one given, or `undefined` when it was the last.
 *
 * Derived from `total` rather than from the page being full: a set whose size is
 * an exact multiple of the page size would otherwise always offer one more page,
 * and that page would come back empty.
 */
function nextPageOf(page: PaginatedCatalogArticlesDto): number | undefined {
  return page.page * page.pageSize < page.total ? page.page + 1 : undefined;
}
