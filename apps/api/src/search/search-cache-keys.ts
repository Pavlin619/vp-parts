import { createHash } from 'node:crypto';
import {
  SearchExecution,
  shouldRequestCriteriaFacets,
  TecDocSearchType,
} from './search-types';
import { SearchRequest, SearchSetRequest } from './search-call';

/**
 * Folds a query to one case so the same number typed differently shares a cache
 * entry. Free-text is lowercased and numbers uppercased, each matching how
 * TecDoc treats that search type; the Bulgarian locale is explicit so the
 * mapping does not depend on the host's default.
 */
export function normaliseCacheQuery(query: string, searchType: number): string {
  const trimmed = query.trim();

  return searchType === TecDocSearchType.FreeText
    ? trimmed.toLocaleLowerCase('bg-BG')
    : trimmed.toLocaleUpperCase('bg-BG');
}

/**
 * Cache key for the enumeration of a whole match set. Everything that changes
 * which articles match is folded into the digest, and the collection members are
 * sorted so two callers that selected the same facets in a different order share
 * one entry.
 *
 * Deliberately page-free: the enumeration describes the set rather than a slice
 * of it, so one entry answers every page of a search.
 *
 * Sort-free for the stronger reason that the same articles match whichever order
 * they are read in. Keyed on it, changing the sort would re-fetch a set of up to
 * a thousand candidates from TecDoc to hand back the rows already in hand.
 */
export function searchSetCacheKey(request: SearchSetRequest): string {
  return `tecdoc:search:set:${digest(matchSetIdentity(request))}`;
}

/**
 * Cache key for a whole match set already ranked into the order it was asked
 * for.
 *
 * Page-free for the same reason the enumeration's key is, and load-bearing here
 * rather than merely economical: the pages of one search are cut from one
 * ranking precisely because they share this key. Which is also why the sort
 * *is* in it — one ranking per order, or switching sorts would page on through
 * the pinned copy of the previous one and appear to do nothing.
 *
 * It is a separate namespace from the enumeration rather than a field in it
 * because the two age at completely different rates — the set is TecDoc
 * catalogue data, the order is our stock minutes ago.
 */
export function searchOrderCacheKey(request: SearchSetRequest): string {
  return `search:order:${digest(sortedIdentity(request))}`;
}

/**
 * Cache key for one page of rows in a catalogue order — the fallback path's
 * read, and the only search read a page number belongs in. The sort is TecDoc's
 * own here, applied inside the page read, so two sorts are two different pages.
 */
export function searchPageCacheKey(request: SearchRequest): string {
  const identity = {
    ...sortedIdentity(request),
    page: request.page,
    pageSize: request.pageSize,
  };

  return `tecdoc:search:page:${digest(identity)}`;
}

function sortedIdentity(request: SearchSetRequest): Record<string, unknown> {
  return { ...matchSetIdentity(request), sort: request.sort };
}

function matchSetIdentity(request: SearchSetRequest): Record<string, unknown> {
  const { query, vehicleId, execution, filters } = request;

  return {
    query: normaliseCacheQuery(query, execution.type),
    vehicleId: vehicleId ?? null,
    execution,
    // Numeric comparator: the default sort is lexicographic, which would order
    // [4, 30] as [30, 4] and make the key needlessly hard to reason about.
    brandIds: [...(filters.brandIds ?? [])].sort((a, b) => a - b),
    productTypeIds: [...(filters.productTypeIds ?? [])].sort((a, b) => a - b),
    categoryNodeId: filters.categoryNodeId ?? null,
    // The decision, not the raw `categoryHasChildren` hint: it is what
    // actually changes the TecDoc payload, so hints that resolve the same way
    // (absent and "has children") share one entry while an opted-in leaf gets
    // its own.
    criteriaFacets: shouldRequestCriteriaFacets(filters),
    criteria: [...(filters.criteria ?? [])].sort((left, right) => {
      const leftKey = `${left.criteriaId}:${left.rawValue}`;
      const rightKey = `${right.criteriaId}:${right.rawValue}`;

      return leftKey.localeCompare(rightKey);
    }),
  };
}

/**
 * Cache key for an article-autocomplete dropdown. The match strategy is part of
 * the key so the prefix and exact dropdowns for the same input never collide.
 */
export function autocompleteArticlesCacheKey(
  query: string,
  execution: SearchExecution,
): string {
  const cacheQuery = normaliseCacheQuery(query, execution.type);

  return `tecdoc:autocomplete:article:${execution.matchType ?? 'any'}:${cacheQuery}`;
}

export function autocompleteTermsCacheKey(query: string): string {
  const cacheQuery = normaliseCacheQuery(query, TecDocSearchType.FreeText);

  return `tecdoc:autocomplete:term:${cacheQuery}`;
}

function digest(identity: unknown): string {
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
