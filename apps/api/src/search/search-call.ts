import {
  SearchExecution,
  SearchFilters,
  SearchMode,
  TecDocSearchType,
} from './search-types';
import { ParsedQuery } from './query-parser';

/**
 * The TecDoc call a search makes: the query string to send and the
 * {@link SearchExecution} (type + match strategy) to run it with. One per
 * search — {@link searchCallFor} decides it from the query and the mode.
 */
export interface SearchCall {
  query: string;
  execution: SearchExecution;
}

/**
 * Everything about a search that is *not* decided by the query: which vehicle
 * it is scoped to, which page is wanted, and how it is narrowed. A call is run
 * against a scope to make one concrete {@link SearchRequest}, which is what
 * keeps the enumeration, the cache key and the page read from each
 * re-declaring the same six parameters.
 */
export interface SearchScope {
  vehicleId?: number;
  page: number;
  pageSize: number;
  filters: SearchFilters;
}

/**
 * Which articles a search matches, fully specified and with no page in it: the
 * identity of a whole match set. What the enumeration is read and cached by, so
 * every page of one search shares the entry.
 */
export type SearchSetRequest = SearchCall &
  Omit<SearchScope, 'page' | 'pageSize'>;

/**
 * One fully-specified TecDoc search call, page included. Threading it as a
 * single value makes it impossible to reorder two of its parts at one call site
 * only.
 */
export type SearchRequest = SearchCall & SearchScope;

export function setRequestFor(
  call: SearchCall,
  scope: SearchScope,
): SearchSetRequest {
  return {
    ...call,
    vehicleId: scope.vehicleId,
    filters: scope.filters,
  };
}

export function requestFor(
  call: SearchCall,
  scope: SearchScope,
): SearchRequest {
  return { ...call, ...scope };
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
 * Resolves a parsed query + the client-selected {@link SearchMode} into the one
 * TecDoc call that answers it. The mode is chosen up front on the FE, so we
 * never guess number-vs-text.
 *
 * - `generic` → `searchType 99` free-text over the **raw** query. Brand
 *   stripping is a number-search fix and free text needs none: TecDoc's own
 *   full-text handles a brand word in the query.
 * - `part_number_exact` → `searchType 10` / `exact` over the **raw** query. An
 *   exact request is a precise lookup and must not be rewritten.
 * - `part_number` (default) → `searchType 10` / `prefix_or_suffix` over the
 *   **brand-stripped** query. No free-text fallback — a descriptive query
 *   belongs in `generic`.
 *
 * A `part_number` search once also attempted the raw query when stripping had
 * changed it, in case the stripped token was part of the number. Measured
 * against the live service over 127 queries it never once answered something
 * the stripped call could not: `searchType 10` reads a whole query as a single
 * number, so a two-token query matches nothing, and `prefix_or_suffix` still
 * finds a part whose number *begins* with its own brand (BSG files
 * `BSG 70-550-001`) from the stripped `70-550-001` alone.
 */
export function searchCallFor(
  parsed: ParsedQuery,
  searchMode: SearchMode,
): SearchCall {
  if (searchMode === SearchMode.Generic) {
    return { query: parsed.raw, execution: FREE_TEXT_EXECUTION };
  }

  if (searchMode === SearchMode.PartNumberExact) {
    return { query: parsed.raw, execution: EXACT_NUMBER_EXECUTION };
  }

  return { query: parsed.brandStripped, execution: PREFIX_NUMBER_EXECUTION };
}
