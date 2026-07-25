import { AttributeFacetRole } from '@vp-parts-shop/shared';

export type SearchMatchType =
  | 'exact'
  | 'prefix'
  | 'suffix'
  | 'prefix_or_suffix';

/**
 * TecDoc `getArticles` search strategies we route to:
 * - `AnyNumber` (10) — match against article / OE / trade numbers, EANs, etc.
 *   Used for part-number queries; pair with a {@link SearchMatchType}.
 * - `FreeText` (99) — full-text search over article descriptions. Used for
 *   descriptive queries ("oil filter bosch"); `matchType` does not apply.
 */
export const TecDocSearchType = {
  AnyNumber: 10,
  FreeText: 99,
} as const;

export type TecDocSearchType =
  (typeof TecDocSearchType)[keyof typeof TecDocSearchType];

/**
 * A resolved search strategy for one TecDoc `getArticles` call: which
 * {@link TecDocSearchType} to use and, for number searches, how to match. The
 * search service maps a query's intent (part-number vs free-text, exact toggle)
 * to one or more of these; free-text (`type: 99`) leaves `matchType` unset.
 */
export interface SearchExecution {
  type: TecDocSearchType;
  matchType?: SearchMatchType;
}

export const DEFAULT_SEARCH_EXECUTION: SearchExecution = {
  type: TecDocSearchType.AnyNumber,
  matchType: 'prefix_or_suffix',
};

/**
 * How many autocomplete suggestions to request from TecDoc and surface. Applies
 * to both article (`getArticles`) and term (`getAutoCompleteSuggestions`)
 * autocomplete so the dropdown is capped consistently regardless of mode.
 */
export const AUTOCOMPLETE_SUGGESTIONS_LIMIT = 8;

/**
 * How many category suggestions to surface in the part-number autocomplete
 * dropdown (the InterCars-style "search {term} in {category}" rows built from
 * the `assemblyGroupFacets` of the same `getArticles` call). Kept well below the
 * article limit so the categories stay a compact secondary section, not a wall.
 */
export const CATEGORY_AUTOCOMPLETE_LIMIT = 5;

/**
 * Article-autocomplete strategy for a live part-number dropdown: a `prefix`
 * number search, so suggestions appear as the user types the start of a number.
 */
export const DEFAULT_AUTOCOMPLETE_EXECUTION: SearchExecution = {
  type: TecDocSearchType.AnyNumber,
  matchType: 'prefix',
};

/**
 * Article-autocomplete strategy for the exact-number toggle: an `exact` number
 * match, mirroring how `part_number_exact` search runs (a suggestion only
 * surfaces once the typed number matches a real article exactly).
 */
export const EXACT_AUTOCOMPLETE_EXECUTION: SearchExecution = {
  type: TecDocSearchType.AnyNumber,
  matchType: 'exact',
};

/**
 * The search intent the client selects up front, mapped 1:1 from the FE
 * controls so illegal combinations (e.g. "generic + exact") cannot be
 * expressed. Each mode resolves to a distinct TecDoc call plan in
 * `buildSearchPlan`:
 * - `part_number` (default) — `searchType 10` / `prefix_or_suffix` over the
 *   brand-stripped query, then the raw query if it differs. No free-text
 *   fallback: a descriptive query belongs in `generic`.
 * - `part_number_exact` — `searchType 10` / `exact` over the raw query only.
 *   No brand stripping, no fallback: an exact request is a precise lookup.
 * - `generic` — a single `searchType 99` free-text call over the raw query.
 *   No brand stripping, no number lane.
 */
export const SearchMode = {
  PartNumber: 'part_number',
  PartNumberExact: 'part_number_exact',
  Generic: 'generic',
} as const;

export type SearchMode = (typeof SearchMode)[keyof typeof SearchMode];

export const DEFAULT_SEARCH_MODE: SearchMode = SearchMode.PartNumber;

/**
 * A single technical-attribute (criteria) narrowing: the TecDoc `criteriaId`
 * plus the machine `rawValue` echoed back from an `AttributeFacetValueDto`.
 */
export interface CriteriaFilter {
  criteriaId: string;
  rawValue: string;
}

/**
 * Optional narrowing a caller applies to a search, selected from the facet
 * values returned on a previous search:
 * - `brandIds` — TecDoc dataSupplierIds (brand facet value ids); multi-select.
 * - `categoryNodeId` — a single TecDoc assemblyGroupNodeId. Category navigation
 *   is a single-path drill-down (one node at a time, deeper until a leaf), so it
 *   is a scalar, not an array — unlike the multi-select brand/criteria filters.
 * - `criteria` — technical-attribute selections (criteriaId + rawValue).
 * Groups are AND-combined; ids within a multi-select group are OR-combined.
 *
 * `categoryHasChildren` is not a filter but a performance hint about
 * `categoryNodeId` — see {@link shouldRequestCriteriaFacets}.
 */
export interface SearchFilters {
  brandIds?: string[];
  categoryNodeId?: string;
  categoryHasChildren?: boolean;
  criteria?: CriteriaFilter[];
}

/**
 * The only page whose response carries the attribute (dimension) facets. They
 * describe the whole match set, so every later page would repeat page 1's block
 * verbatim; the client keeps the page-1 set while paginating. The cheap brand
 * and category blocks are still sent on every page.
 */
export const SEARCH_FACET_PAGE = 1;

/**
 * Whether a search should ask TecDoc for the technical-attribute (`criteria`)
 * facets that become the response's `attributes` — the single place that
 * decides, so the TecDoc request and the Redis cache key never disagree.
 *
 * Attribute facets are only meaningful on a leaf category: a mid-level node
 * spans unrelated product types, so TecDoc would compute and ship a large,
 * incoherent criteria block that the leaf gate in `SearchTecDoc.searchArticles`
 * then discards. We therefore skip requesting them unless all of the following
 * hold:
 *
 * - **A category is selected.** A broad search has no coherent criteria at all.
 * - **The client explicitly reported that category as a leaf.** Dimensions are
 *   strictly opt-in: only `categoryHasChildren === false` asks for them. Leafness
 *   is not derivable before the call — it comes from the `assemblyGroupFacets` of
 *   this very response — so the client supplies it from the `hasChildren` it
 *   already holds for every category it renders (the previous response's
 *   `categoryNavigation`, or the leaf-only category rows in autocomplete). An
 *   **absent** hint therefore means "do not fetch": a caller that never asked is
 *   never charged for the criteria block. The hint is never trusted for
 *   correctness either — the leaf gate on the response still decides whether the
 *   mapped attributes are actually returned.
 * - **It is the first page.** Facets are computed over the whole match set, so
 *   every later page would recompute and re-ship a block identical to page 1's.
 */
export function shouldRequestCriteriaFacets(
  filters: SearchFilters | undefined,
  page: number,
): boolean {
  if (!filters?.categoryNodeId) {
    return false;
  }

  if (filters.categoryHasChildren !== false) {
    return false;
  }

  return page === SEARCH_FACET_PAGE;
}

/**
 * Maps a TecDoc criteriaId (or, in dev, the mock's attribute label) to a
 * semantic {@link AttributeFacetRole} the client can render with a bespoke
 * control (e.g. a front/rear car diagram) instead of a plain value list.
 *
 * [VERIFY-TC] The numeric TecDoc criteriaId(s) below are best-effort candidates
 * and MUST be confirmed against the Pegasus 3.0 Test Client — a wrong id would
 * mislabel an unrelated criterion. The Bulgarian label entry only exists so the
 * mock client surfaces the role in dev; live data is matched by criteriaId.
 */
export const FITTING_POSITION_CRITERIA_ID = '2';

export const ATTRIBUTE_ROLE_BY_ID: Readonly<
  Record<string, AttributeFacetRole>
> = {
  [FITTING_POSITION_CRITERIA_ID]: 'fitting-position',
  'Позиция на монтаж': 'fitting-position',
};

export function attributeRoleFor(id: string): AttributeFacetRole | null {
  return ATTRIBUTE_ROLE_BY_ID[id] ?? null;
}
