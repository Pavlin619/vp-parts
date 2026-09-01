import {
  AttributeFacetDto,
  CategoryNavigationDto,
  SearchFacetDto,
} from '@vp-parts-shop/shared';
import { ArticleCandidate } from '../tecdoc';

/**
 * How many matches a search may have and still be answered in our own order.
 *
 * It is TecDoc's `perPage` ceiling — `Field 'perPage' must be > 0 and <= 1000`
 * — because ranking by what we can ship is only meaningful if the ranking saw
 * every match, and one call is all we are willing to spend enumerating a set.
 * A wider set is served in TecDoc's order instead; narrowing it by brand,
 * product type or category is what brings it back under the limit.
 */
export const SEARCH_SORTABLE_LIMIT = 1000;

/**
 * A whole match set, read cheaply: what the set measures, what it can be
 * narrowed by, and — when it fits — every article in it.
 *
 * Page-independent by design. This is what makes it worth caching once per
 * search rather than once per page: the facets and the total are the same
 * whichever page is being rendered, and the ordered set is cut into pages here
 * rather than by TecDoc.
 */
export interface SearchEnumeration {
  total: number;
  /**
   * Every match, as candidates — or empty when the set is too wide to enumerate
   * (see {@link SEARCH_SORTABLE_LIMIT}), which is not the same as no matches.
   * Read `total` for that.
   */
  candidates: ArticleCandidate[];
  facets: SearchFacetDto[];
  attributes: AttributeFacetDto[];
  categoryNavigation: CategoryNavigationDto;
}

/**
 * Whether a match set of this size can be ordered by availability.
 *
 * The one place the tier is decided, so the read, the cache and the response
 * label cannot disagree about which order a visitor is looking at.
 */
export function isSortableSet(total: number): boolean {
  return total <= SEARCH_SORTABLE_LIMIT;
}

/**
 * The highest page a visitor can actually reach.
 *
 * An ordered set is paged by us, out of an enumeration we hold, so every page of
 * it is reachable and the count is exact. TecDoc's own ceiling only binds the
 * fallback: it serves the first ~10,000 results of a match set and reports the
 * resulting bound as `maxAllowedPage`, which shrinks as `perPage` grows — so a
 * broad free-text query can report millions of matches and still refuse anything
 * past page 500. Taking the lower of the two is belt and braces, since TecDoc
 * already factors the match count into its cap.
 */
export function resolveMaxPage(
  total: number,
  pageSize: number,
  maxAllowedPage?: number,
): number {
  const pageCount = Math.ceil(total / pageSize);

  return maxAllowedPage === undefined
    ? pageCount
    : Math.min(maxAllowedPage, pageCount);
}

/**
 * An enumeration of a set too wide to order: everything the facets and the
 * pager need, with the candidates dropped.
 *
 * A wide set's candidates are read and discarded — TecDoc has no way to answer
 * "how many" without also answering "which", short of a second call — so they
 * are dropped before the entry is cached rather than pinning several hundred
 * kilobytes nothing will read.
 */
export function withoutCandidates(
  enumeration: SearchEnumeration,
): SearchEnumeration {
  return { ...enumeration, candidates: [] };
}
