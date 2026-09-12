import { DEFAULT_SEARCH_MODE } from "@vp-parts-shop/shared";
import type { CategoryTreeNode } from "./category-tree";
import {
  buildSearchUrl,
  drillIntoCategory,
  newSearch,
  withVehicle,
} from "./search-url";

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
  const search = newSearch({ query: "", mode: DEFAULT_SEARCH_MODE });
  const browse = vehicleId ? withVehicle(search, vehicleId) : search;

  return buildSearchUrl(
    path.reduce(
      (state, node) =>
        drillIntoCategory(state, {
          id: node.category.id,
          hasChildren: node.children.length > 0,
        }),
      browse,
    ),
  );
}
