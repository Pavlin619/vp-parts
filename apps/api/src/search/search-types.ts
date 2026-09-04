import {
  AttributeFacetRole,
  DEFAULT_SEARCH_MODE,
  DimensionScope,
  SearchMode,
  SearchSort,
  StockScope,
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
 * How many articles the autocomplete `getArticles` read asks for. Deliberately
 * larger than {@link ARTICLE_AUTOCOMPLETE_LIMIT}: the zero-result "did you
 * mean" recovery shares this cached entry and has a page to fill rather than a
 * dropdown, so the rows the dropdown does not show are not wasted.
 */
export const ARTICLE_AUTOCOMPLETE_FETCH_LIMIT = 8;

/**
 * How many article rows the dropdown shows above the category section. Held to
 * five so the categories are on screen without scrolling — a dropdown that
 * fills itself with near-identical numbers answers only the visitor who
 * already knows which one they want.
 */
export const ARTICLE_AUTOCOMPLETE_LIMIT = 5;

/**
 * How many term suggestions (`getAutoCompleteSuggestions`) to surface. Higher
 * than the article limit because generic mode has no category section beneath
 * it, so the terms are the whole dropdown.
 */
export const TERM_AUTOCOMPLETE_LIMIT = 8;

/**
 * How many category suggestions to surface in the part-number autocomplete
 * dropdown (the InterCars-style "search {term} in {category}" rows built from
 * the `assemblyGroupFacets` of the same `getArticles` call).
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
export { DEFAULT_SEARCH_MODE, SearchMode };

/**
 * A single technical-attribute (criteria) narrowing: the TecDoc `criteriaId`
 * plus the machine `rawValue` echoed back from an `AttributeFacetValueDto`.
 *
 * **Two entries sharing a `criteriaId` are OR-combined, and two different ids
 * are AND-combined.** The schema states neither, so it was measured against the
 * live endpoint: on one product type, `форма`=Правоъгълен matched 3,201 and
 * `форма`=кръгъл 1,341, and the two together matched exactly 4,542; adding a
 * second criterion instead narrowed 3,201 to 3,022. Both the multi-select and
 * the merged-value token in `dimension-facets.ts` depend on the OR half — under
 * AND, picking two values of one criterion would return nothing every time.
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
 * Two members are not TecDoc narrowings and never reach the catalogue:
 * `categoryHasChildren` is a performance hint about `categoryNodeId` (see
 * {@link shouldRequestCriteriaFacets}), and `stockScope` is ours alone — see
 * below. Neither belongs in a cache key as it stands: `matchSetIdentity` picks
 * the members that change which articles TecDoc matches, one by one, precisely
 * so a member like these cannot fragment the entry by being added here.
 */
export interface SearchFilters {
  brandIds?: number[];
  productTypeIds?: number[];
  categoryNodeId?: number;
  categoryHasChildren?: boolean;
  criteria?: CriteriaFilter[];
  /**
   * Narrow to the parts one stock origin can ship. Nothing TecDoc can filter on
   * knows what we hold, so this is applied to the ranked set after it has been
   * enumerated — which also means it is honoured only where a ranking exists.
   * A match set too wide to rank is served unnarrowed, and says so by returning
   * no stock counts.
   */
  stockScope?: StockScope;
}

/**
 * Everything a search is run with. An object rather than a parameter list
 * because all but the query are optional and several are adjacent numbers —
 * positionally, `('WL634', undefined, 1, 20)` says nothing about which number
 * is the page.
 */
export interface SearchInput {
  query: string;
  vehicleId?: number;
  page?: number;
  pageSize?: number;
  filters?: SearchFilters;
  searchMode?: SearchMode;
  sort?: SearchSort;
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
 * semantic {@link AttributeFacetRole}. Today the web reads it only to rank a
 * criterion to the top of the sidebar (`orderedFacets`) — a mechanic reaches
 * for "which corner of the car" before any dimension. It is also the hook for
 * rendering a bespoke control, e.g. a front/rear diagram, in place of a value
 * list.
 *
 * Both ids are read off the live catalogue. `100` is the criterion that says
 * where a part goes — its values mix side, axle and height ("отпред", "ляво",
 * "задна ос", "вътрешен", "от двете страни на предната ос"), which is one
 * control's worth of meaning rather than three. `273` is the axle on its own.
 *
 * A previous `'2'` was a guess and is not a criterion TecDoc files at all: it
 * appeared in none of 320 distinct criteria measured across brake discs, pads,
 * shock absorbers, control arms, headlights and filters, so no facet was ever
 * role-tagged in production. Do not add an id here without reading it out of a
 * `criteriaFacets` response first.
 *
 * The Bulgarian label entry only exists so the mock client surfaces the role in
 * dev; live data is matched by criteriaId.
 */
export const FITTING_POSITION_CRITERIA_ID = '100';

export const AXLE_CRITERIA_ID = '273';

export const ATTRIBUTE_ROLE_BY_ID: Readonly<
  Record<string, AttributeFacetRole>
> = {
  [FITTING_POSITION_CRITERIA_ID]: 'fitting-position',
  [AXLE_CRITERIA_ID]: 'axle',
  'Позиция на монтаж': 'fitting-position',
};

export function attributeRoleFor(id: string): AttributeFacetRole | null {
  return ATTRIBUTE_ROLE_BY_ID[id] ?? null;
}
