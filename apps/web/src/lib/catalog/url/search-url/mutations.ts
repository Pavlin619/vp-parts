import type {
  CategoryOptionDto,
  SearchMode,
  SearchSort,
  StockScope,
} from "@vp-parts-shop/shared";
import { isAttributeSelected } from "./queries";
import { FIRST_PAGE, type SearchUrlState } from "./state";

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

/**
 * Scopes the search to a vehicle, which is the strongest narrowing on offer and
 * the one the wide-result prompt leads with.
 *
 * Drops every selection for the reason {@link withMode} does: the results become
 * a different set, and the facet ids the filters were picked from may not appear
 * in it at all.
 */
export function withVehicle(
  state: SearchUrlState,
  vehicleId: string,
): SearchUrlState {
  return { ...clearAllFilters(state), vehicleId };
}

/**
 * Widens the search back to every vehicle, and drops the selections for the
 * same reason {@link withVehicle} does — the result set is replaced either way,
 * so the ids the filters were picked from need not appear in the new one.
 */
export function withoutVehicle(state: SearchUrlState): SearchUrlState {
  return { ...clearAllFilters(state), vehicleId: undefined };
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
 * Moves to the node a whole path stands for, outermost first. This is what the
 * breadcrumb navigates with, and it takes a path rather than a number of steps
 * because a crumb can sit several levels above the current node — and because
 * the trail it comes from is the catalogue's tree, which is not always the
 * steps that were clicked: entering from a category suggestion records one
 * step for a node several levels down.
 *
 * Every node with something selected below it is by definition a branch, so
 * `hasChildren` is `true` without another lookup, which correctly stops the API
 * computing dimensions for a mid-level subtree.
 */
export function selectCategoryPath(
  state: SearchUrlState,
  categoryPath: string[],
): SearchUrlState {
  return {
    ...state,
    categoryPath,
    categoryHasChildren: categoryPath.length > 0 ? true : undefined,
    productTypeId: undefined,
    attributes: [],
    page: FIRST_PAGE,
  };
}

/** Steps one level back up the path that was clicked to get here. */
export function categoryUp(state: SearchUrlState): SearchUrlState {
  return selectCategoryPath(state, state.categoryPath.slice(0, -1));
}

export function clearCategory(state: SearchUrlState): SearchUrlState {
  return selectCategoryPath(state, []);
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

/**
 * Applies or clears a whole group of one criterion's values at once.
 *
 * A diagram zone stands for several TecDoc codes — front-left is filed as `VL`
 * and as `LV`, plus the numbered-axle variants — and toggling them one at a
 * time would leave a zone half-selected, with its next href depending on which
 * of its codes was read first. Any of them already applied counts the zone as
 * selected, so one click clears all of them.
 */
export function toggleAttributeGroup(
  state: SearchUrlState,
  criteriaId: string,
  values: readonly string[],
): SearchUrlState {
  const grouped = new Set(values);
  const withoutGroup = state.attributes.filter(
    (attribute) =>
      !(attribute.criteriaId === criteriaId && grouped.has(attribute.value)),
  );
  const wasSelected = withoutGroup.length !== state.attributes.length;

  return {
    ...state,
    attributes: wasSelected
      ? withoutGroup
      : [...state.attributes, ...values.map((value) => ({ criteriaId, value }))],
    page: FIRST_PAGE,
  };
}

export function clearAttributes(state: SearchUrlState): SearchUrlState {
  return { ...state, attributes: [], page: FIRST_PAGE };
}

/**
 * Narrows to one stock origin, or back to all of them with `undefined`. The
 * facet selections survive: this narrows the ranked set the API already
 * enumerated, so it changes neither which articles TecDoc matched nor the
 * facets offered over them.
 */
export function withStockScope(
  state: SearchUrlState,
  stockScope: StockScope | undefined,
): SearchUrlState {
  return { ...state, stockScope, page: FIRST_PAGE };
}

/**
 * Re-orders the results. Back to page 1 like every narrowing, and for a stronger
 * reason than most: the rows do not merely shrink, they move, so page 3 of the
 * previous order describes nothing in the new one.
 *
 * The filters all survive — an order is not a narrowing, and re-picking a brand
 * after sorting by price is exactly the friction the control exists to remove.
 */
export function withSort(
  state: SearchUrlState,
  sort: SearchSort,
): SearchUrlState {
  return { ...state, sort, page: FIRST_PAGE };
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
    stockScope: undefined,
    page: FIRST_PAGE,
  };
}
