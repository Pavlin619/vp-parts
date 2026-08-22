import {
  DEFAULT_SEARCH_MODE,
  hasCoherentDimensions,
  isSearchMode,
  type AttributeSelectionDto,
  type CategoryOptionDto,
  type SearchMode,
} from "@vp-parts-shop/shared";

/**
 * The `/search` URL is the single source of truth for every filter: the page is
 * server-rendered, so a selection is a navigation and the facet counts that come
 * back always describe the result set actually on screen. Nothing here touches
 * React — parsing and the mutations below are pure so they can be unit-tested
 * and shared between the server page and the client filter controls.
 */

export const SEARCH_PARAM = {
  query: "q",
  vehicleId: "vehicleId",
  page: "page",
  mode: "mode",
  brand: "brand",
  productType: "type",
  category: "cat",
  categoryHasChildren: "catHasChildren",
  attribute: "attr",
} as const;

export const SEARCH_PATH = "/search";
export const SEARCH_PAGE_SIZE = 20;
export const FIRST_PAGE = 1;

/** Mirrors the API's `SEARCH_MAX_FILTER_VALUES`, which rejects longer lists. */
const MAX_FILTER_VALUES = 50;

export interface SearchUrlState {
  query: string;
  vehicleId?: string;
  page: number;
  mode: SearchMode;
  /** Selected TecDoc dataSupplierIds; multi-select, OR-combined by the API. */
  brandIds: string[];
  /**
   * The selected TecDoc genericArticleId — what the part *is*. Single-select
   * because it is the last level of the category drill rather than a facet of
   * its own: generic articles hang off an assembly group (`genericArticlesRecord`
   * carries an `assemblyGroup`), so picking one is descending, not filtering.
   * It is also what makes the dimension facets available, which only make sense
   * for one product type at a time.
   */
  productTypeId?: string;
  /**
   * The category drill path, outermost first, of which only the last entry is
   * an actual filter. The ancestors are carried so the sidebar can offer "one
   * level up" — the API's category navigation is single-level and returns no
   * breadcrumb, so the trail can only live here.
   */
  categoryPath: string[];
  /**
   * `hasChildren` of the selected node, echoed back from the option that was
   * clicked. The API only computes the dimension facets when this is explicitly
   * `false`, so an absent value means "do not fetch them".
   */
  categoryHasChildren?: boolean;
  attributes: AttributeSelectionDto[];
}

type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

export function parseSearchUrl(input: SearchParamsInput): SearchUrlState {
  const read = reader(input);
  const categoryPath = read.all(SEARCH_PARAM.category).slice(0, MAX_FILTER_VALUES);

  return {
    query: (read.one(SEARCH_PARAM.query) ?? "").trim(),
    vehicleId: read.one(SEARCH_PARAM.vehicleId) || undefined,
    page: parsePage(read.one(SEARCH_PARAM.page)),
    mode: parseMode(read.one(SEARCH_PARAM.mode)),
    brandIds: read.all(SEARCH_PARAM.brand).slice(0, MAX_FILTER_VALUES),
    productTypeId: read.one(SEARCH_PARAM.productType) || undefined,
    categoryPath,
    categoryHasChildren: parseCategoryHasChildren(
      read.one(SEARCH_PARAM.categoryHasChildren),
      categoryPath,
    ),
    attributes: parseAttributes(read.all(SEARCH_PARAM.attribute)),
  };
}

/**
 * A fresh, unnarrowed search — what submitting the header search box means.
 * Filters are never carried over: they were picked from the facets of a
 * different query's results.
 */
export function newSearch(params: {
  query: string;
  mode: SearchMode;
  vehicleId?: string;
}): SearchUrlState {
  return {
    query: params.query,
    mode: params.mode,
    vehicleId: params.vehicleId,
    page: FIRST_PAGE,
    brandIds: [],
    productTypeId: undefined,
    categoryPath: [],
    categoryHasChildren: undefined,
    attributes: [],
  };
}

export function buildSearchUrl(state: SearchUrlState): string {
  const params = new URLSearchParams();

  params.set(SEARCH_PARAM.query, state.query);

  if (state.vehicleId) {
    params.set(SEARCH_PARAM.vehicleId, state.vehicleId);
  }

  if (state.mode !== DEFAULT_SEARCH_MODE) {
    params.set(SEARCH_PARAM.mode, state.mode);
  }

  for (const nodeId of state.categoryPath) {
    params.append(SEARCH_PARAM.category, nodeId);
  }

  if (state.categoryPath.length > 0 && state.categoryHasChildren !== undefined) {
    params.set(
      SEARCH_PARAM.categoryHasChildren,
      String(state.categoryHasChildren),
    );
  }

  for (const brandId of state.brandIds) {
    params.append(SEARCH_PARAM.brand, brandId);
  }

  if (state.productTypeId) {
    params.set(SEARCH_PARAM.productType, state.productTypeId);
  }

  for (const attribute of state.attributes) {
    params.append(
      SEARCH_PARAM.attribute,
      encodeAttribute(attribute),
    );
  }

  if (state.page > FIRST_PAGE) {
    params.set(SEARCH_PARAM.page, String(state.page));
  }

  return `${SEARCH_PATH}?${params}`;
}

export function selectedCategoryId(state: SearchUrlState): string | undefined {
  return state.categoryPath.at(-1);
}

/**
 * Flattens the URL state into the `/search` call it stands for. Only the last
 * node of the drill path is a filter — the ancestors exist so the sidebar can
 * walk back up — so the API is sent one `categoryNodeId`, as its contract
 * requires. Structurally typed to `SearchArticlesParams` rather than importing
 * it, which would drag a `server-only` module into the client components that
 * share this file.
 */
export function toSearchRequest(state: SearchUrlState) {
  return {
    query: state.query,
    vehicleId: state.vehicleId,
    page: state.page,
    pageSize: SEARCH_PAGE_SIZE,
    mode: state.mode,
    brandIds: state.brandIds,
    productTypeIds: state.productTypeId ? [state.productTypeId] : [],
    categoryNodeId: selectedCategoryId(state),
    categoryHasChildren: state.categoryHasChildren,
    attributes: state.attributes,
  };
}

export function hasActiveFilters(state: SearchUrlState): boolean {
  return (
    state.brandIds.length > 0 ||
    state.productTypeId !== undefined ||
    state.categoryPath.length > 0 ||
    state.attributes.length > 0
  );
}

/**
 * Whether this search is narrowed enough for the API to have computed the
 * dimension facets. The rule itself is shared with the API — see
 * {@link hasCoherentDimensions} — so the sidebar never asks for a narrowing the
 * API does not require, nor discards a block it already paid TecDoc for.
 */
export function hasDimensions(state: SearchUrlState): boolean {
  return hasCoherentDimensions({
    productTypeCount: state.productTypeId === undefined ? 0 : 1,
    hasCategory: state.categoryPath.length > 0,
    categoryHasChildren: state.categoryHasChildren,
  });
}

/**
 * Whether the requested page lies past the end of the result set, meaning the
 * visitor should be sent to {@link SearchUrlState.page} `= maxPage` instead of
 * being shown the empty page they asked for.
 *
 * Left alone, an out-of-range page renders an empty result list, which the
 * no-matches copy then blames on filters that may not even be set. Result pages
 * get bookmarked and crawled, and `maxPage` shrinks whenever the match set does,
 * so yesterday's valid link is today's blank page.
 *
 * A `maxPage` of 0 is not out of range: that is a genuinely empty result set,
 * and page 1 of nothing is the right place to stand.
 */
export function isPageOutOfRange(
  state: SearchUrlState,
  maxPage: number,
): boolean {
  return maxPage >= FIRST_PAGE && state.page > maxPage;
}

/**
 * Identifies the result set the facet blocks describe, ignoring the page. The
 * API computes the dimension facets on page 1 only, so the sidebar retains that
 * block while the visitor paginates; this key is what tells it the underlying
 * result set has actually changed and the retained block must be dropped.
 *
 * Attribute selections are deliberately excluded — they always return to page 1
 * and so are answered by a fresh block anyway.
 */
export function facetScopeKey(state: SearchUrlState): string {
  return [
    state.query,
    state.mode,
    state.vehicleId ?? "",
    state.categoryPath.join("/"),
    [...state.brandIds].sort().join(","),
    state.productTypeId ?? "",
  ].join("|");
}

export function isAttributeSelected(
  state: SearchUrlState,
  criteriaId: string,
  value: string,
): boolean {
  return state.attributes.some(
    (attribute) =>
      attribute.criteriaId === criteriaId && attribute.value === value,
  );
}

// ── Mutations ────────────────────────────────────────────────────────────────
// All of them are pure and all but `withPage` return to page 1: a narrowed
// search has a different, shorter result set, so keeping the old page number
// would land the visitor past its end.

export function withPage(state: SearchUrlState, page: number): SearchUrlState {
  return { ...state, page: Math.max(FIRST_PAGE, page) };
}

/**
 * Switching mode re-runs the query against a different TecDoc strategy, so the
 * result set — and with it every facet id the current filters were picked from
 * — is replaced. Carrying the selections over would filter the new results by
 * brands and categories that may not appear in them at all.
 */
export function withMode(
  state: SearchUrlState,
  mode: SearchMode,
): SearchUrlState {
  return { ...clearAllFilters(state), mode };
}

export function toggleBrand(
  state: SearchUrlState,
  brandId: string,
): SearchUrlState {
  const brandIds = state.brandIds.includes(brandId)
    ? state.brandIds.filter((id) => id !== brandId)
    : [...state.brandIds, brandId];

  return { ...state, brandIds, page: FIRST_PAGE };
}

export function clearBrands(state: SearchUrlState): SearchUrlState {
  return { ...state, brandIds: [], page: FIRST_PAGE };
}

/**
 * Descends into a product type — the last level of the drill, below the
 * assembly groups. The attribute selections are dropped because TecDoc defines
 * its criteria per product type, so the dimensions on offer belong to the set
 * being left, exactly as when drilling into a category.
 */
export function selectProductType(
  state: SearchUrlState,
  productTypeId: string,
): SearchUrlState {
  return { ...state, productTypeId, attributes: [], page: FIRST_PAGE };
}

/** Steps back out of a product type to the assembly group that contains it. */
export function clearProductType(state: SearchUrlState): SearchUrlState {
  return {
    ...state,
    productTypeId: undefined,
    attributes: [],
    page: FIRST_PAGE,
  };
}

/**
 * Drills one level down. The attribute selections are dropped because they
 * belong to the criteria of the category being left — the new node exposes a
 * different criteria block, and a stale `attr` would silently narrow it.
 */
export function drillIntoCategory(
  state: SearchUrlState,
  option: Pick<CategoryOptionDto, "id" | "hasChildren">,
): SearchUrlState {
  return {
    ...state,
    categoryPath: [...state.categoryPath, option.id],
    categoryHasChildren: option.hasChildren,
    productTypeId: undefined,
    attributes: [],
    page: FIRST_PAGE,
  };
}

/**
 * Steps one level back up. The node being returned to is by definition a
 * branch — we drilled through it to get here — so `hasChildren` is `true`
 * without another lookup, which correctly stops the API computing dimensions
 * for a mid-level subtree.
 */
export function categoryUp(state: SearchUrlState): SearchUrlState {
  const categoryPath = state.categoryPath.slice(0, -1);

  return {
    ...state,
    categoryPath,
    categoryHasChildren: categoryPath.length > 0 ? true : undefined,
    productTypeId: undefined,
    attributes: [],
    page: FIRST_PAGE,
  };
}

export function clearCategory(state: SearchUrlState): SearchUrlState {
  return {
    ...state,
    categoryPath: [],
    categoryHasChildren: undefined,
    productTypeId: undefined,
    attributes: [],
    page: FIRST_PAGE,
  };
}

export function toggleAttribute(
  state: SearchUrlState,
  criteriaId: string,
  value: string,
): SearchUrlState {
  const attributes = isAttributeSelected(state, criteriaId, value)
    ? state.attributes.filter(
        (attribute) =>
          !(attribute.criteriaId === criteriaId && attribute.value === value),
      )
    : [...state.attributes, { criteriaId, value }];

  return { ...state, attributes, page: FIRST_PAGE };
}

export function clearAttributes(state: SearchUrlState): SearchUrlState {
  return { ...state, attributes: [], page: FIRST_PAGE };
}

/** Clears every narrowing but keeps the query, the vehicle and the mode. */
export function clearAllFilters(state: SearchUrlState): SearchUrlState {
  return {
    ...state,
    brandIds: [],
    productTypeId: undefined,
    categoryPath: [],
    categoryHasChildren: undefined,
    attributes: [],
    page: FIRST_PAGE,
  };
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

interface ParamReader {
  one: (key: string) => string | undefined;
  all: (key: string) => string[];
}

function reader(input: SearchParamsInput): ParamReader {
  if (input instanceof URLSearchParams) {
    return {
      one: (key) => input.get(key) ?? undefined,
      all: (key) => input.getAll(key).filter(Boolean),
    };
  }

  return {
    one: (key) => {
      const value = input[key];
      return Array.isArray(value) ? value[0] : value;
    },
    all: (key) => {
      const value = input[key];
      if (value === undefined) {
        return [];
      }
      return (Array.isArray(value) ? value : [value]).filter(Boolean);
    },
  };
}

function parsePage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= FIRST_PAGE ? page : FIRST_PAGE;
}

function parseMode(raw: string | undefined): SearchMode {
  return isSearchMode(raw) ? raw : DEFAULT_SEARCH_MODE;
}

/**
 * Only an explicit `false` opts into the dimension facets, so anything else —
 * absent, misspelled, or describing a category that is no longer selected —
 * resolves to "unknown" rather than to a boolean the API would act on.
 */
function parseCategoryHasChildren(
  raw: string | undefined,
  categoryPath: string[],
): boolean | undefined {
  if (categoryPath.length === 0) {
    return undefined;
  }

  if (raw === "true") {
    return true;
  }

  return raw === "false" ? false : undefined;
}

/**
 * Splits each `criteriaId:value` pair on the FIRST colon so a value may contain
 * colons of its own, mirroring the API's own parser. A malformed entry is
 * dropped rather than throwing: these come from a facet block we served, so a
 * broken one means a hand-edited URL, not a search worth failing.
 */
function parseAttributes(raw: string[]): AttributeSelectionDto[] {
  return raw.slice(0, MAX_FILTER_VALUES).reduce<AttributeSelectionDto[]>(
    (selections, entry) => {
      const separatorIndex = entry.indexOf(":");
      const criteriaId = entry.slice(0, separatorIndex);
      const value = entry.slice(separatorIndex + 1);

      if (separatorIndex > 0 && value.length > 0) {
        selections.push({ criteriaId, value });
      }

      return selections;
    },
    [],
  );
}

export function encodeAttribute(attribute: AttributeSelectionDto): string {
  return `${attribute.criteriaId}:${attribute.value}`;
}
