import {
  DEFAULT_SEARCH_MODE,
  DEFAULT_SEARCH_SORT,
  type AttributeSelectionDto,
} from "@vp-parts-shop/shared";
import {
  FIRST_PAGE,
  SEARCH_PAGE_SIZE,
  SEARCH_PARAM,
  SEARCH_PATH,
  selectedCategoryId,
  type SearchUrlState,
} from "./state";

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

  if (state.stockScope) {
    params.set(SEARCH_PARAM.stock, state.stockScope);
  }

  if (state.sort !== DEFAULT_SEARCH_SORT) {
    params.set(SEARCH_PARAM.sort, state.sort);
  }

  if (state.page > FIRST_PAGE) {
    params.set(SEARCH_PARAM.page, String(state.page));
  }

  return `${SEARCH_PATH}?${params}`;
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
    stockScope: state.stockScope,
    sort: state.sort,
  };
}

function encodeAttribute(attribute: AttributeSelectionDto): string {
  return `${attribute.criteriaId}:${attribute.value}`;
}
