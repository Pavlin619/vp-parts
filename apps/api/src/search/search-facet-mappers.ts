import {
  CategoryAutocompleteItemDto,
  CategoryNavigationDto,
  CategoryOptionDto,
  FacetValueDto,
  SearchFacetDto,
} from '@vp-parts-shop/shared';
import { AssemblyGroupType } from '../tecdoc';
import { CATEGORY_AUTOCOMPLETE_LIMIT } from './search-types';

/**
 * One node of a `getArticles` `assemblyGroupFacets` tree (TecDoc
 * `AssemblyGroupFacetCount`). `children` is TecDoc's count of the node's child
 * assembly groups — distinct from the child `options` the navigation builder
 * derives, and the authoritative leafness signal because the facet is scoped to
 * the match set and may omit children the node really has. `count` is optional
 * in the schema — "counts are only populated for a linkage filter's assembly
 * group type" — but measured populated on every node of both trees with no
 * linkage at all, so a null one is defensive rather than expected.
 *
 * **`assemblyGroupNodeId` is unique across trees**, which is why
 * {@link buildCategoryNavigation} keys its node map on the bare id. A
 * catalogue-wide search asks for the passenger-car and universal trees together
 * (the schema: "Multiple tree types can be combined"), so a reused number would
 * silently overwrite one node with another and hang a breadcrumb off a parent
 * from the other tree. Measured over 2,277 distinct ids drawn from all six tree
 * types (P, U, B, O, M, A): none is reused by two of them.
 *
 * The **names** are not unique, though, which is the one thing
 * `assemblyGroupType` is read for — see {@link qualifiedLabelsFor}.
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
 * One brand (`dataSupplier`) facet count from a `getArticles` response.
 */
export interface TecDocBrandFacetCount {
  dataSupplierId: number;
  mfrName: string;
  count: number;
}

/**
 * Turns the raw TecDoc brand facet counts into the shared brand facet group.
 * Values carry a `dataSupplierId` id (so a selection maps back to the
 * `dataSupplierIds` filter) with the logo left null for the brands layer to
 * join. An empty group is dropped so the response only advertises a facet the
 * user can actually apply.
 */
export function mapBrandFacets(
  brandCounts: TecDocBrandFacetCount[] = [],
): SearchFacetDto[] {
  const brandValues: FacetValueDto[] = brandCounts.map((c) => ({
    id: String(c.dataSupplierId),
    label: c.mfrName,
    count: c.count,
    imageUrl: null,
  }));

  return brandValues.length > 0 ? [{ id: 'brands', values: brandValues }] : [];
}

/**
 * One generic-article facet count from a `getArticles`
 * `includeGenericArticleFacets` response — TecDoc's own answer to "what kinds
 * of part are in this result set".
 */
export interface TecDocGenericArticleFacetCount {
  genericArticleId: number;
  genericArticleDescription: string;
  count: number;
}

/**
 * How many product types a search offers. TecDoc files roughly 7,600 generic
 * articles and counts every one a broad query touches — measured at 7,541
 * values (721 KB of a 786 KB cache entry, and the same again on the wire) for a
 * single-character query. The sidebar only offers this list once the assembly
 * group tree runs out of levels, where the widest measured set was four, so the
 * cap is far above what any visitor reaches and the tail it drops is a tail
 * nothing renders.
 */
export const PRODUCT_TYPE_FACET_LIMIT = 60;

/**
 * Turns the raw TecDoc generic-article counts into the shared product-type
 * facet group, most-matched first and capped at
 * {@link PRODUCT_TYPE_FACET_LIMIT}. Unlike the brand values these carry no
 * `imageUrl` at all: a product type has no logo to join, and an explicit `null`
 * would invite the brands layer to fill one in.
 *
 * `selectedIds` are kept whatever their count, because TecDoc counts the
 * product types of the set *before* its own `genericArticleIds` filter — so
 * this list is where a page reached by deep link finds the name of its own
 * selection, for the sidebar heading and the breadcrumb both.
 */
export function mapProductTypeFacets(
  genericArticleCounts: TecDocGenericArticleFacetCount[] = [],
  selectedIds: number[] = [],
): SearchFacetDto[] {
  const byCount = [...genericArticleCounts].sort(
    (left, right) => right.count - left.count,
  );

  const capped = byCount.slice(0, PRODUCT_TYPE_FACET_LIMIT);
  const values: FacetValueDto[] = [
    ...capped,
    ...selectedBeyond(byCount, capped, selectedIds),
  ].map((c) => ({
    id: String(c.genericArticleId),
    label: c.genericArticleDescription,
    count: c.count,
  }));

  return values.length > 0 ? [{ id: 'productTypes', values }] : [];
}

function selectedBeyond(
  counts: TecDocGenericArticleFacetCount[],
  kept: TecDocGenericArticleFacetCount[],
  selectedIds: number[],
): TecDocGenericArticleFacetCount[] {
  if (selectedIds.length === 0) {
    return [];
  }

  const keptIds = new Set(kept.map((count) => count.genericArticleId));

  return counts.filter(
    (count) =>
      selectedIds.includes(count.genericArticleId) &&
      !keptIds.has(count.genericArticleId),
  );
}

/**
 * Turns the flat TecDoc `assemblyGroupFacets` counts into **single-level**
 * navigation: the immediate `options` for the current position (roots when
 * nothing is selected, otherwise the selected node's children), the `current`
 * node, and the `ancestors` above it. The UI drills one level at a time and
 * re-issues the search per click, so the whole subtree is never shipped — only
 * the one path back out.
 *
 * `current` and `ancestors` are both best-effort: they are resolvable only for
 * the nodes TecDoc returns in the match-scoped facet. In practice both always
 * resolve — a facet filtered to one node answers with that node, its children
 * and its **complete** ancestor chain, which is what lets the search ask for
 * neither the whole tree nor a second call. Measured on 17 nodes at depths 2 to
 * 4, catalogue-wide and vehicle-scoped: 17 complete chains, 0 short.
 *
 * **The options at one level overlap, and that is TecDoc's model rather than a
 * bug to filter out.** The tree is not one taxonomy with a single home per
 * part: it flattens several orthogonal axes into one list of roots — what a
 * part *is*, why it is replaced, and where it sits on the car. A vehicle-scoped
 * search for "филтър" (100 articles) returns `филтър` with 100 and `части за
 * сервиз/инспекция/обслужване` with the **identical** 100 identities, while
 * `двигател` 66, `кормилно управление` 15, `горивопроводна система` 12 and
 * `отопление` 7 are mutually disjoint and partition the same 100 exactly. The
 * counts sum to 300 for a set of 100, because each article is filed under three
 * roots. So a level's counts never sum to the total, and two options can narrow
 * to the same list.
 *
 * The overlap is served as it comes. **Do not filter a root out because its
 * count equals the total.** That is the rule dimension facets use for a
 * single-value criterion, and on a tree it inverts: `филтър` is exactly such a
 * root and its children are the most useful split available (маслен 56,
 * хидравличен 15, горивен 12, въздушен 10, филтър купе 7), whereas `части за
 * сервиз` splits into Периодична подмяна 88 / Други 12. Dropping both would
 * delete the best navigation and keep the worst.
 */
/**
 * What a category tree is called when its name has to be said out loud. Only
 * the trees a search can actually span are worded: a catalogue-wide search asks
 * for `P` and `U` together, and under a vehicle TecDoc answers from one tree, so
 * `P`/`U` is the only pair measured colliding. Passenger car is deliberately
 * absent — it is the shop's default context, so it keeps TecDoc's plain name and
 * only the other side of a collision is qualified.
 *
 * Bulgarian because the labels beside it are: `lang: 'bg'` is fixed on every
 * TecDoc call, so a category name is already Bulgarian display text by the time
 * it reaches this file. A second language would need this map keyed by it.
 */
const TREE_QUALIFIER: Readonly<Record<string, string>> = {
  [AssemblyGroupType.Universal]: 'универсални части',
  [AssemblyGroupType.Motorcycle]: 'мотоциклети',
  [AssemblyGroupType.CommercialVehicle]: 'товарни автомобили',
};

/**
 * Resolves the label each node should be shown under, qualifying only the ones
 * a visitor could not otherwise tell apart.
 *
 * The passenger-car and universal trees genuinely duplicate names: measured
 * catalogue-wide, `q=филтър` had 9 of 37 root labels used twice and
 * `q=двигател` 23 of 67 — "двигател" is both `100002` (passenger car,
 * 133,828 articles) and `705972` (universal, 1). Two options reading exactly
 * the same is a coin toss the visitor cannot win.
 *
 * Only a *sibling* collision is qualified, because siblings are what a level
 * renders side by side; the same name under two different parents is told apart
 * by where the visitor is. And only the non-passenger-car side gains a suffix —
 * picking a winner to *drop* is what this deliberately does not do, since the
 * bigger side is not consistently the passenger-car one ("климатична уредба" is
 * 114 universal against 87 passenger car), so suppressing either would
 * sometimes hide the larger category.
 */
function qualifiedLabelsFor(
  siblingGroups: Iterable<TecDocAssemblyGroupFacetCount[]>,
): Map<number, string> {
  const labels = new Map<number, string>();

  for (const siblings of siblingGroups) {
    const nodesByLabel = new Map<string, TecDocAssemblyGroupFacetCount[]>();

    for (const node of siblings) {
      const sharing = nodesByLabel.get(node.assemblyGroupName) ?? [];
      sharing.push(node);
      nodesByLabel.set(node.assemblyGroupName, sharing);
    }

    for (const sharing of nodesByLabel.values()) {
      if (sharing.length < 2) {
        continue;
      }

      for (const node of sharing) {
        const qualifier = TREE_QUALIFIER[node.assemblyGroupType ?? ''];

        if (qualifier) {
          labels.set(
            node.assemblyGroupNodeId,
            `${node.assemblyGroupName} (${qualifier})`,
          );
        }
      }
    }
  }

  return labels;
}

/**
 * Options keep the order TecDoc sent them in, and the `sortNo` on every node is
 * deliberately not read. That field is the catalogue's own display order, so
 * sorting by it looks like the obvious thing to do — but the order we already
 * get is alphabetical by localised name (298 of 318 sibling groups over eight
 * queries) and stable, agreeing across three identical requests and between a
 * page-1 and a page-2 read. Sorting would swap one defined order for another,
 * and `sortNo` runs an independent sequence per tree — both P and U roots start
 * at 1 — so it would need a tree precedence and a tie-break invented here.
 *
 * The one wart it would fix is a duplicated label whose smaller twin lists
 * first, and that is 10 of those 318 groups, already told apart by
 * {@link qualifiedLabelsFor}.
 */
export function buildCategoryNavigation(
  counts: TecDocAssemblyGroupFacetCount[] = [],
  selectedNodeId?: number,
): CategoryNavigationDto {
  // Keyed by string so the `__root__` sentinel can share the map with the
  // node ids; the selected id is stringified once, on the way in.
  const ROOT_KEY = '__root__';
  const selectedKey =
    selectedNodeId !== undefined ? String(selectedNodeId) : undefined;
  const nodeById = new Map<string, TecDocAssemblyGroupFacetCount>();
  const childrenByParent = new Map<string, TecDocAssemblyGroupFacetCount[]>();

  for (const raw of counts) {
    nodeById.set(String(raw.assemblyGroupNodeId), raw);
  }

  for (const raw of counts) {
    const parentId = raw.parentNodeId != null ? String(raw.parentNodeId) : null;
    const key =
      parentId != null && nodeById.has(parentId) ? parentId : ROOT_KEY;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(raw);
    childrenByParent.set(key, siblings);
  }

  const qualifiedLabels = qualifiedLabelsFor(childrenByParent.values());

  const toOption = (raw: TecDocAssemblyGroupFacetCount): CategoryOptionDto => {
    const id = String(raw.assemblyGroupNodeId);
    const childList = childrenByParent.get(id) ?? [];
    return {
      id,
      label:
        qualifiedLabels.get(raw.assemblyGroupNodeId) ?? raw.assemblyGroupName,
      count: raw.count ?? null,
      hasChildren: childList.length > 0 || (raw.children ?? 0) > 0,
    };
  };

  const optionSource = selectedKey
    ? (childrenByParent.get(selectedKey) ?? [])
    : (childrenByParent.get(ROOT_KEY) ?? []);
  const options = optionSource.map(toOption);

  const currentRaw = selectedKey ? nodeById.get(selectedKey) : undefined;
  const current = currentRaw ? toOption(currentRaw) : null;
  const ancestors = ancestorsOf(currentRaw, nodeById).map(toOption);

  return { current, ancestors, options };
}

/**
 * Walks the parent links from a node outwards, returning the chain outermost
 * first and without the node itself.
 *
 * The `seen` set is not defensive coding: `parentNodeId` arrives over an
 * untyped JSON transport, and a chain that loops back on itself would spin
 * here forever rather than fail.
 */
function ancestorsOf(
  node: TecDocAssemblyGroupFacetCount | undefined,
  nodeById: Map<string, TecDocAssemblyGroupFacetCount>,
): TecDocAssemblyGroupFacetCount[] {
  if (!node) {
    return [];
  }

  const ancestors: TecDocAssemblyGroupFacetCount[] = [];
  const seen = new Set([String(node.assemblyGroupNodeId)]);

  let current: TecDocAssemblyGroupFacetCount | undefined = node;

  while (current?.parentNodeId != null) {
    const parentKey = String(current.parentNodeId);
    const parent = nodeById.get(parentKey);

    if (!parent || seen.has(parentKey)) {
      break;
    }

    seen.add(parentKey);
    ancestors.unshift(parent);
    current = parent;
  }

  return ancestors;
}

/**
 * Turns the autocomplete call's `assemblyGroupFacets` into the InterCars-style
 * category suggestions: the leaf categories the matches fall into, each a
 * "search {term} in {label}" row carrying the `assemblyGroupNodeId` the FE
 * re-runs as the `categoryNodeId` filter.
 *
 * Two rules keep them useful:
 * - Only **leaf** nodes (no children) — a leaf carries the disambiguation
 *   (brake pipe vs cabin filter), whereas a parent (e.g. "Braking system")
 *   would collapse distinct product types back together.
 * - Emitted only when the matches span **more than one** category; a single
 *   category (e.g. an exact number that is all oil filters) adds no
 *   disambiguation, so the section is dropped entirely.
 *
 * The kept leaves are ordered by match count (most relevant first) and capped
 * at {@link CATEGORY_AUTOCOMPLETE_LIMIT}.
 */
export function buildCategorySuggestions(
  term: string,
  counts: TecDocAssemblyGroupFacetCount[] = [],
): CategoryAutocompleteItemDto[] {
  const parentIds = new Set(
    counts
      .map((raw) => raw.parentNodeId)
      .filter((id): id is number => id != null)
      .map(String),
  );

  const leaves = counts.filter(
    (raw) =>
      (raw.children ?? 0) === 0 &&
      !parentIds.has(String(raw.assemblyGroupNodeId)),
  );

  if (leaves.length <= 1) {
    return [];
  }

  return leaves
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, CATEGORY_AUTOCOMPLETE_LIMIT)
    .map((raw) => ({
      kind: 'category',
      term,
      categoryNodeId: String(raw.assemblyGroupNodeId),
      label: raw.assemblyGroupName,
      count: raw.count ?? null,
    }));
}
