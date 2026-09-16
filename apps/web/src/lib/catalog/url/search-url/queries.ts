import { hasCoherentDimensions } from "@vp-parts-shop/shared";
import { FIRST_PAGE, selectedCategoryId, type SearchUrlState } from "./state";

export function hasActiveFilters(state: SearchUrlState): boolean {
  return (
    state.brandIds.length > 0 ||
    state.productTypeId !== undefined ||
    state.categoryPath.length > 0 ||
    state.attributes.length > 0 ||
    state.stockScope !== undefined
  );
}

/**
 * Whether there is anything for the API to search: something typed, a vehicle,
 * or a category. This is the page's copy of the API's own rule — `q` is
 * optional exactly when a vehicle or a category narrows the search — which is
 * what keeps its 400 unreachable from the UI.
 *
 * Deliberately narrower than {@link isNarrowedSearch}. A brand, a stock scope
 * or an attribute narrows a result set but cannot stand alone as a subject:
 * every part BOSCH makes is a catalogue-wide read, and the API refuses it.
 */
export function hasSearchSubject(state: SearchUrlState): boolean {
  return (
    state.query !== "" ||
    state.vehicleId !== undefined ||
    selectedCategoryId(state) !== undefined
  );
}

/**
 * Whether anything beyond the query is narrowing the results — what an empty
 * result set has to know before it blames the query itself.
 *
 * The vehicle counts here and not in {@link hasActiveFilters}, which answers the
 * narrower question of whether the sidebar's facet controls are holding
 * anything back.
 */
export function isNarrowedSearch(state: SearchUrlState): boolean {
  return hasActiveFilters(state) || state.vehicleId !== undefined;
}

/**
 * How many narrowings the filters panel is currently holding — what its mobile
 * trigger has to say, since the blocks themselves are behind it.
 *
 * Counts the panel's own axes and nothing else. The stock scope is a narrowing
 * too, but its control sits in the results header, so counting it here would
 * send a visitor into the panel looking for something that is not in it. The
 * category path counts once however deep it is: the drill is one selection with
 * a trail behind it, not one per level.
 */
export function countActiveFilters(state: SearchUrlState): number {
  return (
    (state.vehicleId ? 1 : 0) +
    (state.categoryPath.length > 0 ? 1 : 0) +
    (state.productTypeId ? 1 : 0) +
    state.brandIds.length +
    state.attributes.length
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
 * and so are answered by a fresh block anyway. So is the stock scope, which
 * narrows the ranked set rather than the match set: the facets describe what
 * TecDoc matched, and that is the same list whichever origin is selected. The
 * sort is excluded for the stronger version of that reason — it narrows nothing
 * at all, so re-ordering a list cannot change what its facets count.
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
