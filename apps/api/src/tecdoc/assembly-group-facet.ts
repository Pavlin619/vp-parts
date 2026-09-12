import { ArticleCategoryNodeDto } from '@vp-parts-shop/shared';
import { catalogLabelOf } from './catalog-label';
import { AssemblyGroupType } from './tecdoc-target-types';

/**
 * The passenger-car and universal assembly-group trees in one request. TecDoc
 * concatenates the codes (see {@link AssemblyGroupType}), and both are needed
 * wherever there is no vehicle linkage: oils, wipers and workshop consumables
 * are filed under Universal, so asking for the passenger-car tree alone
 * returns those articles while offering no category to place them under.
 *
 * **A facet call that names no tree at all answers with nothing.** Measured on
 * a single-article lookup: `{ enabled: true }` alone returned 0 nodes, and the
 * same call with this value returned 7. TecDoc infers the tree from a linkage
 * when there is one, and a lookup by number carries none.
 */
export const CATALOGUE_WIDE_TREES = `${AssemblyGroupType.PassengerCar}${AssemblyGroupType.Universal}`;

/**
 * One node of a `getArticles` `assemblyGroupFacets` tree (TecDoc
 * `AssemblyGroupFacetCount`). `children` is TecDoc's count of the node's child
 * assembly groups — distinct from the child options a navigation builder
 * derives, and the authoritative leafness signal because the facet is scoped to
 * the match set and may omit children the node really has. `count` is optional
 * in the schema — "counts are only populated for a linkage filter's assembly
 * group type" — but measured populated on every node of both trees with no
 * linkage at all, so a null one is defensive rather than expected.
 *
 * **`assemblyGroupNodeId` is unique across trees**, which is why the readers
 * below key their node maps on the bare id. A catalogue-wide search asks for
 * the passenger-car and universal trees together (the schema: "Multiple tree
 * types can be combined"), so a reused number would silently overwrite one node
 * with another and hang a breadcrumb off a parent from the other tree. Measured
 * over 2,277 distinct ids drawn from all six tree types (P, U, B, O, M, A):
 * none is reused by two of them.
 *
 * The **names** are not unique, though, which is the one thing
 * `assemblyGroupType` is read for — see `qualifiedLabelsFor` in the search's
 * facet mappers.
 *
 * **This is not the `assemblyGroupNodeId` filed on a generic article.** That
 * one is a legacy id in its own space: MAHLE OX 389/1D reports 72 ("смазване")
 * there while this facet calls the same category 100245, and sending 72 as a
 * filter is refused `400 Field 'assemblyGroupNodeId' has an invalid value:72`.
 */
export interface TecDocAssemblyGroupFacetCount {
  assemblyGroupNodeId: number;
  assemblyGroupName: string;
  assemblyGroupType?: string;
  parentNodeId?: number | null;
  children?: number;
  count?: number;
}

/**
 * Every trail through the category tree that reaches the articles a facet was
 * computed over, each outermost first.
 *
 * There is more than one because TecDoc's tree is not a taxonomy with a single
 * home per part: it flattens what a part *is*, where it sits on the car and why
 * it is replaced into one set of roots. MAHLE OX 389/1D comes back as `филтър ›
 * маслен филтър`, `двигател › смазване › маслен филтър` and `части за сервиз ›
 * Периодична подмяна` at once. Measured over 20 articles spanning filters,
 * brake discs, pad-wear sensors and handbrake switches: 12 had three trails and
 * 8 had one, every chain complete. Choosing between them is the client's rule.
 *
 * Trails keep the order TecDoc returned their leaves in, for the reason the
 * category options do — the order that arrives is stable, and imposing another
 * would need a tree precedence invented here.
 */
export function assemblyGroupPathsOf(
  counts: TecDocAssemblyGroupFacetCount[] = [],
): ArticleCategoryNodeDto[][] {
  const nodeById = new Map(
    counts.map((node) => [node.assemblyGroupNodeId, node]),
  );

  const parentIds = new Set(
    counts
      .map((node) => node.parentNodeId)
      .filter((id): id is number => id != null),
  );

  return counts
    .filter((node) => !parentIds.has(node.assemblyGroupNodeId))
    .map((leaf) => trailTo(leaf, nodeById));
}

/**
 * The `seen` set is not defensive coding: `parentNodeId` arrives over an
 * untyped JSON transport, and a chain that loops back on itself would spin here
 * forever rather than fail.
 */
function trailTo(
  leaf: TecDocAssemblyGroupFacetCount,
  nodeById: Map<number, TecDocAssemblyGroupFacetCount>,
): ArticleCategoryNodeDto[] {
  const trail: ArticleCategoryNodeDto[] = [];
  const seen = new Set<number>();

  for (
    let node: TecDocAssemblyGroupFacetCount | undefined = leaf;
    node !== undefined && !seen.has(node.assemblyGroupNodeId);
    node =
      node.parentNodeId != null ? nodeById.get(node.parentNodeId) : undefined
  ) {
    seen.add(node.assemblyGroupNodeId);
    trail.unshift({
      id: String(node.assemblyGroupNodeId),
      label: catalogLabelOf(node.assemblyGroupName),
    });
  }

  return trail;
}
