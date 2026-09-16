import { DEFAULT_SEARCH_MODE } from "@vp-parts-shop/shared";
import type { CategoryTreeNode } from "../categories/category-tree";
import {
  buildSearchUrl,
  drillIntoCategory,
  newSearch,
  selectCategoryPath,
  withVehicle,
  type SearchUrlState,
} from "../url/search-url";

/**
 * Where a category on the catalogue page leads: the search, scoped to that node
 * and — where one is picked — the car, with nothing typed. Either is a subject
 * the API accepts in full: `q` is optional exactly when a vehicle *or* a
 * category narrows the search, so browsing the catalogue without a car leads to
 * results rather than to the search's empty state.
 *
 * The whole drilled chain travels, not the node alone. A label sits at two node
 * ids under two parents — `филтър купе` is `100263` under `филтър` and `100346`
 * under `отопление/вентилация` — so only the path says where the visitor was,
 * and it is what the sidebar walks back up. `drillIntoCategory` carries
 * `hasChildren` from the last step, which is what tells the API whether the
 * dimension facets are worth computing.
 */
export function categorySearchHref(
  vehicleId: string | undefined,
  path: CategoryTreeNode[],
): string {
  return buildSearchUrl(
    path.reduce(
      (state, node) =>
        drillIntoCategory(state, {
          id: node.category.id,
          hasChildren: node.children.length > 0,
        }),
      browseFor(vehicleId),
    ),
  );
}

/**
 * The same listing, for a trail of bare ids — the article breadcrumb's case,
 * which knows the chain the part is filed under but holds no tree around it.
 *
 * Leafness cannot be read off such a trail: the facet behind it is scoped to
 * the one article, so it reports the node the part hangs off and its ancestors,
 * never that node's children. The URL therefore claims a branch, which is what
 * {@link selectCategoryPath} writes anyway and what leaves the dimension facets
 * alone — only an explicit `false` asks the API for them, and a wrong one would
 * have TecDoc compute criteria over a whole mid-level subtree.
 */
export function categoryTrailSearchHref(
  vehicleId: string | undefined,
  categoryIds: string[],
): string {
  return buildSearchUrl(selectCategoryPath(browseFor(vehicleId), categoryIds));
}

/** A search with nothing typed, scoped to the car where there is one. */
function browseFor(vehicleId: string | undefined): SearchUrlState {
  const search = newSearch({ query: "", mode: DEFAULT_SEARCH_MODE });

  return vehicleId ? withVehicle(search, vehicleId) : search;
}
