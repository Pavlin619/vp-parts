import {
  SearchExecution,
  SearchFilters,
  SearchMode,
  TecDocSearchType,
} from './search-types';
import { ParsedQuery } from './query-parser';

/**
 * One TecDoc call the search will attempt: the query string to send and the
 * {@link SearchExecution} (type + match strategy) to run it with. A mode expands
 * to an ordered list of these; the first with a non-empty total wins.
 */
export interface SearchPlanStep {
  query: string;
  execution: SearchExecution;
}

/**
 * Everything about a search that is *not* decided by the plan: which vehicle it
 * is scoped to, which page is wanted, and how it is narrowed. A plan step is
 * run against a scope to make one concrete {@link SearchRequest}, which is what
 * lets the lane probe re-run the same steps against a different scope.
 */
export interface SearchScope {
  vehicleId?: number;
  page: number;
  pageSize: number;
  filters: SearchFilters;
}

/**
 * One fully-specified TecDoc search call. Threading these as a single value
 * keeps the lane probe, the cache key and the TecDoc call from each
 * re-declaring the same six parameters — and makes it impossible to reorder two
 * of them at one call site only.
 */
export type SearchRequest = SearchPlanStep & SearchScope;

export function requestFor(
  step: SearchPlanStep,
  scope: SearchScope,
): SearchRequest {
  return { ...step, ...scope };
}

const FREE_TEXT_EXECUTION: SearchExecution = {
  type: TecDocSearchType.FreeText,
};

const EXACT_NUMBER_EXECUTION: SearchExecution = {
  type: TecDocSearchType.AnyNumber,
  matchType: 'exact',
};

const PREFIX_NUMBER_EXECUTION: SearchExecution = {
  type: TecDocSearchType.AnyNumber,
  matchType: 'prefix_or_suffix',
};

/**
 * Expands a parsed query + the client-selected {@link SearchMode} into the
 * ordered TecDoc calls to attempt. The mode is chosen up front on the FE, so
 * we no longer guess number-vs-text: each mode maps to a distinct, minimal
 * plan and the first call with a non-empty total wins (see the lane resolver).
 *
 * - `generic` → a single `searchType 99` free-text call over the **raw**
 *   query. No brand stripping, no number lane.
 * - `part_number_exact` → a single `searchType 10` / `exact` call over the
 *   **raw** query. No brand stripping, no fallback: an exact request is a
 *   precise lookup.
 * - `part_number` (default) → `searchType 10` / `prefix_or_suffix` over the
 *   brand-stripped query, then the raw query if it differs (the "brand" token
 *   may have been part of the number). No free-text fallback — a descriptive
 *   query belongs in `generic`.
 */
export function buildSearchPlan(
  parsed: ParsedQuery,
  searchMode: SearchMode,
): SearchPlanStep[] {
  if (searchMode === SearchMode.Generic) {
    return [{ query: parsed.raw, execution: FREE_TEXT_EXECUTION }];
  }

  if (searchMode === SearchMode.PartNumberExact) {
    return [{ query: parsed.raw, execution: EXACT_NUMBER_EXECUTION }];
  }

  const numberCandidates =
    parsed.raw === parsed.brandStripped
      ? [parsed.brandStripped]
      : [parsed.brandStripped, parsed.raw];

  return numberCandidates.map((query) => ({
    query,
    execution: PREFIX_NUMBER_EXECUTION,
  }));
}
