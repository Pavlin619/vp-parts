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
 * One technical-attribute (criteria) facet block from a `getArticles`
 * `includeCriteriaFacets` response: the criterion metadata plus the value
 * counts over the match set. [VERIFY-TC] exact field names.
 */
export interface TecDocCriteriaFacetCount {
  criteriaId: number;
  criteriaDescription: string;
  criteriaUnitDescription?: string | null;
  criteriaType?: string | null;
  isInterval?: boolean;
  criteriaValues: Array<{
    rawValue: string;
    formattedValue: string;
    count: number;
  }>;
}

/**
 * One node of a `getArticles` `assemblyGroupFacets` tree: the same shape
 * `getAssemblyGroupTree` consumes, extended with the (optional) article `count`
 * and the number of child nodes TecDoc reports for a vehicle-linkage search.
 * `childCount` is our name for that count — [VERIFY-TC] confirm the raw field
 * name/shape against the Test Client (it is a count, distinct from the child
 * `options` the navigation builder derives).
 */
export interface TecDocAssemblyGroupFacetCount {
  assemblyGroupNodeId: number;
  assemblyGroupName: string;
  parentNodeId?: number | null;
  childCount?: number;
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

  return brandValues.length > 0
    ? [{ id: 'brands', label: 'Производител', values: brandValues }]
    : [];
}

/**
 * Turns the raw TecDoc `criteriaFacets` blocks into the shared attribute facet
 * groups. Each criterion becomes one group keyed by its `criteriaId`, carrying
 * the unit and type so the UI can render numeric attributes (with intervals)
 * differently from enum ones. Groups with no values are dropped.
 */
export function mapAttributeFacets(
  criteriaCounts: TecDocCriteriaFacetCount[] = [],
): AttributeFacetDto[] {
  return criteriaCounts
    .map((criterion): AttributeFacetDto => {
      const values: AttributeFacetValueDto[] = (
        criterion.criteriaValues ?? []
      ).map((v) => ({
        value: v.rawValue,
        label: v.formattedValue,
        count: v.count,
      }));

      const id = String(criterion.criteriaId);

      return {
        id,
        label: criterion.criteriaDescription,
        unit: criterion.criteriaUnitDescription ?? null,
        type: criterion.criteriaType ?? 'A',
        isInterval: criterion.isInterval ?? false,
        role: attributeRoleFor(id),
        values,
      };
    })
    .filter((facet) => facet.values.length > 0);
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
      hasChildren: childList.length > 0 || (raw.childCount ?? 0) > 0,
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
      (raw.childCount ?? 0) === 0 &&
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
