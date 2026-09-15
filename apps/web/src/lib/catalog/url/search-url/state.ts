import {
  DEFAULT_SEARCH_SORT,
  type AttributeSelectionDto,
  type SearchMode,
  type SearchSort,
  type StockScope,
} from "@vp-parts-shop/shared";

/**
 * The `/search` URL is the single source of truth for every filter: the page is
 * server-rendered, so a selection is a navigation and the facet counts that come
 * back always describe the result set actually on screen. Nothing in this folder
 * touches React — the parsing, the predicates and the mutations are all pure so
 * they can be unit-tested and shared between the server page and the client
 * filter controls.
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
  stock: "stock",
  sort: "sort",
} as const;

export const SEARCH_PATH = "/search";
export const SEARCH_PAGE_SIZE = 20;
export const FIRST_PAGE = 1;

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
   * level up" without a lookup.
   *
   * This is the path that was *clicked*, which is not always the path through
   * the tree: a category suggestion in the autocomplete lands on a deep leaf in
   * one step. The breadcrumb therefore takes its trail from the API's
   * `ancestors` instead — see `search-breadcrumbs`.
   */
  categoryPath: string[];
  /**
   * `hasChildren` of the selected node, echoed back from the option that was
   * clicked. The API only computes the dimension facets when this is explicitly
   * `false`, so an absent value means "do not fetch them".
   */
  categoryHasChildren?: boolean;
  attributes: AttributeSelectionDto[];
  /**
   * Which stock origin the results are narrowed to; absent means all of them.
   *
   * Unlike every other narrowing here it is not a TecDoc facet — the API applies
   * it to the ranked set after enumerating it, so it is offered only where the
   * response carries stock counts and is simply ignored on a set too wide to
   * rank.
   */
  stockScope?: StockScope;
  /**
   * Which order the results are asked for. Always set, because there is no such
   * thing as an unordered list — an absent `sort` param means the default, not
   * "no preference".
   *
   * Asking for an order a set turns out to be too wide for is not an error: the
   * API answers with the one it fell back to, in `ordering`. Which options are
   * *offered* is decided from the response's `isRankable`, which the URL cannot
   * know before the search has run.
   */
  sort: SearchSort;
}

/**
 * A fresh, unnarrowed search — what submitting the header search box means.
 * Filters are never carried over: they were picked from the facets of a
 * different query's results.
 *
 * Nor is the saved vehicle, which is why this takes no id to scope by. A
 * visitor who picked a car once does not expect every later search to answer
 * only for it; the results page offers that narrowing where it can be seen.
 */
export function newSearch(params: {
  query: string;
  mode: SearchMode;
}): SearchUrlState {
  return {
    query: params.query,
    mode: params.mode,
    vehicleId: undefined,
    page: FIRST_PAGE,
    brandIds: [],
    productTypeId: undefined,
    categoryPath: [],
    categoryHasChildren: undefined,
    attributes: [],
    stockScope: undefined,
    sort: DEFAULT_SEARCH_SORT,
  };
}

export function selectedCategoryId(state: SearchUrlState): string | undefined {
  return state.categoryPath.at(-1);
}
