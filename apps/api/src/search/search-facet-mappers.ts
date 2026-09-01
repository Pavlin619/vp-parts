import {
  AttributeFacetDto,
  AttributeFacetValueDto,
  CategoryAutocompleteItemDto,
  CategoryNavigationDto,
  CategoryOptionDto,
  FacetValueDto,
  SearchFacetDto,
} from '@vp-parts-shop/shared';
import { attributeRoleFor, CATEGORY_AUTOCOMPLETE_LIMIT } from './search-types';

/**
 * TecDoc `CriteriaInfo`: the criterion a criteria facet block describes.
 * `criteriaUnitDescription` is the only part of it we read that the schema
 * marks optional; `isMandatory` and `isInterval` are both required.
 */
export interface TecDocCriteriaInfo {
  criteriaId: number;
  criteriaDescription: string;
  criteriaUnitDescription?: string;
  criteriaType: string;
  isMandatory: boolean;
  isInterval: boolean;
}

/**
 * TecDoc `CriteriaValueCounts`: one selectable value of a criterion, with the
 * machine `rawValue` a `criteriaFilters` selection echoes back and the display
 * `formattedValue`.
 *
 * `permittedKeyValue` is TecDoc's DQM verdict on the value: "for criteriaType
 * 'K', defines whether this value is permitted for a given genericArticle and
 * criteria. Available when filtering by a single genericArticleId and
 * 'applyDqmRules' … is set to true." So the request flag does not drop the
 * impermissible values — it only marks them, and the caller does the dropping.
 * Absent for every criterion that is not a key table, and whenever the flag was
 * not sent.
 */
export interface TecDocCriteriaValueCount {
  rawValue: string;
  formattedValue: string;
  permittedKeyValue?: boolean;
  count: number;
}

/**
 * One technical-attribute facet block from a `getArticles`
 * `includeCriteriaFacets` response (TecDoc `CriteriaFacetCount`): the criterion
 * nested under `criteria`, its values under `criteriaValueCounts`.
 */
export interface TecDocCriteriaFacetCount {
  criteria: TecDocCriteriaInfo;
  criteriaValueCounts?: TecDocCriteriaValueCount[];
}

/**
 * One node of a `getArticles` `assemblyGroupFacets` tree (TecDoc
 * `AssemblyGroupFacetCount`). `children` is TecDoc's count of the node's child
 * assembly groups — distinct from the child `options` the navigation builder
 * derives, and the authoritative leafness signal because the facet is scoped to
 * the match set and may omit children the node really has. `count` is optional:
 * under a linkage filter TecDoc populates it only for that linkage's assembly
 * group type.
 *
 * [VERIFY-TC] The schema's own `assemblyGroupType` — which it marks *required*
 * on every count — is deliberately not read, which assumes `assemblyGroupNodeId`
 * is unique across trees. A catalogue-wide search asks for the passenger-car and
 * universal trees together (the schema: "Multiple tree types can be combined"),
 * and {@link buildCategoryNavigation} keys its node map on the id alone — so if
 * the two trees can reuse a number, one node silently overwrites the other. The
 * schema does not say whether ids are unique per tree or globally, so this is
 * still open. It now carries the breadcrumb as well as `current`: the ancestor
 * walk follows the same map, so a collision could hang a node off a parent from
 * the other tree. Confirm on the Test Client; if ids do collide, the map key has
 * to become `(assemblyGroupType, assemblyGroupNodeId)` and the pair has to
 * travel to the client in place of the bare id.
 */
export interface TecDocAssemblyGroupFacetCount {
  assemblyGroupNodeId: number;
  assemblyGroupName: string;
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
 * Turns the raw TecDoc `criteriaFacets` blocks into the shared attribute facet
 * groups. Each criterion becomes one group keyed by its `criteriaId`, carrying
 * the unit and type so the UI can render numeric attributes (with intervals)
 * differently from enum ones. Values DQM ruled out are dropped, and groups left
 * with none go with them.
 */
export function mapAttributeFacets(
  criteriaCounts: TecDocCriteriaFacetCount[] = [],
): AttributeFacetDto[] {
  return criteriaCounts
    .map(({ criteria, criteriaValueCounts }): AttributeFacetDto => {
      const values: AttributeFacetValueDto[] = (criteriaValueCounts ?? [])
        .filter(isPermittedValue)
        .map((value) => ({
          value: value.rawValue,
          label: value.formattedValue,
          count: value.count,
        }));

      const id = String(criteria.criteriaId);

      return {
        id,
        label: criteria.criteriaDescription,
        unit: criteria.criteriaUnitDescription ?? null,
        type: criteria.criteriaType,
        isInterval: criteria.isInterval,
        isMandatory: criteria.isMandatory,
        role: attributeRoleFor(id),
        values,
      };
    })
    .filter((facet) => facet.values.length > 0);
}

/**
 * Only an explicit `false` is a rejection. TecDoc omits the flag for every
 * criterion that is not a key table and whenever `applyDqmRules` was not sent,
 * so treating absence as "not permitted" would empty the dimension list for
 * every search that does not narrow to one product type.
 */
function isPermittedValue(value: TecDocCriteriaValueCount): boolean {
  return value.permittedKeyValue !== false;
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
 * the nodes TecDoc returns in the match-scoped facet.
 *
 * [VERIFY-TC] The search sends `includeCompleteTree: false`, which the schema
 * documents as "Always return the complete tree back, even if other
 * assemblyGroupsIds are being filtered. Default false" — so under a
 * `assemblyGroupNodeIds` filter the response is anchored on the filtered node
 * (`maxDepth` counts "edges from either a filtered 'assemblyGroupNodeIds' or
 * assembly group root node") and probably omits its ancestors. If it does, this
 * returns an empty chain and the breadcrumb shortens to the current category
 * alone; nothing else changes. Confirm on the Test Client, and if the ancestors
 * are indeed dropped, the fix is `includeCompleteTree: true` whenever a
 * category is selected — at the cost of a larger facet payload.
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

  const toOption = (raw: TecDocAssemblyGroupFacetCount): CategoryOptionDto => {
    const id = String(raw.assemblyGroupNodeId);
    const childList = childrenByParent.get(id) ?? [];
    return {
      id,
      label: raw.assemblyGroupName,
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
