import { createHash } from 'node:crypto';
import {
  SearchExecution,
  shouldRequestCriteriaFacets,
  TecDocSearchType,
} from './search-types';
import { SearchPlanStep, SearchRequest } from './search-plan';

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
 * Cache key for one search page. Everything that changes the TecDoc payload is
 * folded into the digest, and the collection members are sorted so two callers
 * that selected the same facets in a different order share one entry.
 */
export function searchCacheKey(request: SearchRequest): string {
  const { query, vehicleId, execution, page, pageSize, filters } = request;

  const identity = {
    query: normaliseCacheQuery(query, execution.type),
    vehicleId: vehicleId ?? null,
    execution,
    page,
    pageSize,
    // Numeric comparator: the default sort is lexicographic, which would order
    // [4, 30] as [30, 4] and make the key needlessly hard to reason about.
    brandIds: [...(filters.brandIds ?? [])].sort((a, b) => a - b),
    productTypeIds: [...(filters.productTypeIds ?? [])].sort((a, b) => a - b),
    categoryNodeId: filters.categoryNodeId ?? null,
    // The decision, not the raw `categoryHasChildren` hint: it is what
    // actually changes the TecDoc payload, so hints that resolve the same way
    // (absent and "has children") share one entry while an opted-in leaf gets
    // its own.
    criteriaFacets: shouldRequestCriteriaFacets(filters, page),
    criteria: [...(filters.criteria ?? [])].sort((left, right) => {
      const leftKey = `${left.criteriaId}:${left.rawValue}`;
      const rightKey = `${right.criteriaId}:${right.rawValue}`;

      return leftKey.localeCompare(rightKey);
    }),
  };

  return `tecdoc:search:${digest(identity)}`;
}

/**
 * Cache key for the lane memo. It deliberately leaves out the filters, the
 * page and the page size: the lane is a property of the query itself, so one
 * entry serves every refinement and every page of that search. The vehicle
 * scope is part of it because it changes which lane has matches.
 */
export function laneCacheKey(
  plan: SearchPlanStep[],
  vehicleId: number | undefined,
): string {
  const identity = {
    plan: plan.map((step) => ({
      query: laneToken(step),
      execution: step.execution,
    })),
    vehicleId: vehicleId ?? null,
  };

  return `tecdoc:search:lane:${digest(identity)}`;
}

/**
 * A lane's stored identity: its query in the same normalised form the search
 * cache key uses, so the same number typed in different cases shares one memo.
 */
export function laneToken(step: SearchPlanStep): string {
  return normaliseCacheQuery(step.query, step.execution.type);
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
