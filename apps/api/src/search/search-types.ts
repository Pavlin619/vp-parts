import {
  AttributeFacetRole,
  DimensionScope,
  hasCoherentDimensions,
} from '@vp-parts-shop/shared';

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
 * The client-selected search intent. Defined in `@vp-parts-shop/shared` because
 * it is the wire contract — the web app puts it in the `/search` URL — and
 * re-exported here so the search module's own files keep importing it from one
 * place. Each mode maps to a distinct TecDoc call in `searchCallFor`.
 */
export { DEFAULT_SEARCH_MODE, SearchMode } from '@vp-parts-shop/shared';

/**
 * A single technical-attribute (criteria) narrowing: the TecDoc `criteriaId`
 * plus the machine `rawValue` echoed back from an `AttributeFacetValueDto`.
 *
 * [VERIFY-TC] How TecDoc combines two entries carrying the **same**
 * `criteriaId` is undocumented — the schema gives the pair and no semantics.
 * The web app offers the values of one criterion as a multi-select, which only
 * works if they are OR-combined; if they are AND-combined instead, picking two
 * values of one criterion returns nothing every time. Confirm on the Test
 * Client before trusting the multi-select, and make the control single-select
 * if it turns out to be AND.
 */
export interface CriteriaFilter {
  criteriaId: number;
  rawValue: string;
}

/**
 * Optional narrowing a caller applies to a search, selected from the facet
 * values returned on a previous search:
 * - `brandIds` — TecDoc dataSupplierIds (brand facet value ids); multi-select.
 * - `productTypeIds` — TecDoc genericArticleIds (product-type facet value ids);
 *   multi-select. Sent as `genericArticleIds`.
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
  brandIds?: number[];
  productTypeIds?: number[];
  categoryNodeId?: number;
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

export function isFacetPage(page: number): boolean {
  return page === SEARCH_FACET_PAGE;
}

/**
 * Whether exactly one product type is selected — which is what TecDoc requires
 * before it will rule on key-table criteria values (`applyDqmRules`), and one
 * of the two narrowings {@link hasCoherentDimensions} accepts.
 */
export function hasSingleProductType(
  filters: SearchFilters | undefined,
): boolean {
  return filters?.productTypeIds?.length === 1;
}

/**
 * Restates a caller's filters as the narrowing facts the shared dimension rule
 * is defined over.
 *
 * `categoryHasChildren` is a hint, not a fact we verified: leafness comes from
 * the `assemblyGroupFacets` of the very response being requested, so the client
 * echoes back the `hasChildren` it already holds for every category it renders.
 * It is never trusted for correctness — the response-side gate in
 * `SearchTecDoc` still decides whether the mapped attributes are returned.
 */
function dimensionScopeOf(filters: SearchFilters | undefined): DimensionScope {
  return {
    productTypeCount: filters?.productTypeIds?.length ?? 0,
    hasCategory: filters?.categoryNodeId !== undefined,
    categoryHasChildren: filters?.categoryHasChildren,
  };
}

/**
 * Whether the enumeration should ask TecDoc for the technical-attribute
 * (`criteria`) facets that become the response's `attributes` — the single place
 * that decides, so the TecDoc request and the Redis cache key never disagree.
 *
 * Which narrowings qualify is {@link hasCoherentDimensions}, shared with the web
 * app so the two cannot drift. No page comes into it: the enumeration describes
 * the whole match set and is read once per search, so which page a visitor is on
 * changes neither the request nor its cache entry. Whether the block is *sent*
 * is {@link isFacetPage}'s decision, made where the response is assembled.
 */
export function shouldRequestCriteriaFacets(
  filters: SearchFilters | undefined,
): boolean {
  return hasCoherentDimensions(dimensionScopeOf(filters));
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
