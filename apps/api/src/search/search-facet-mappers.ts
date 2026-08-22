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
 * [VERIFY-TC] The schema's own `assemblyGroupType` is deliberately not read,
 * which assumes `assemblyGroupNodeId` is unique across trees. A catalogue-wide
 * search asks for the passenger-car and universal trees together, and
 * {@link buildCategoryNavigation} keys its node map on the id alone — so if the
 * two trees can reuse a number, one node silently overwrites the other.
 * Confirm on the Test Client; if ids do collide, the map key has to become
 * `(assemblyGroupType, assemblyGroupNodeId)` and the pair has to travel to the
 * client in place of the bare id.
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
 * Turns the raw TecDoc generic-article counts into the shared product-type
 * facet group. Unlike the brand values these carry no `imageUrl` at all: a
 * product type has no logo to join, and an explicit `null` would invite the
 * brands layer to fill one in.
 */
export function mapProductTypeFacets(
  genericArticleCounts: TecDocGenericArticleFacetCount[] = [],
): SearchFacetDto[] {
  const values: FacetValueDto[] = genericArticleCounts.map((c) => ({
    id: String(c.genericArticleId),
    label: c.genericArticleDescription,
    count: c.count,
  }));

  return values.length > 0 ? [{ id: 'productTypes', values }] : [];
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
 * nothing is selected, otherwise the selected node's children) plus the
 * `current` node. The UI drills one level at a time and re-issues the search
 * per click, so the whole subtree is never shipped and there is no breadcrumb
 * (each level is its own search URL). `current` is best-effort — resolvable
 * only when TecDoc returns the selected node in the scoped facet ([VERIFY-TC]).
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

  return { current, options };
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
