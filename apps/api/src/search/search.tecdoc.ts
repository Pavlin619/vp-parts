import { Injectable } from '@nestjs/common';
import {
  PaginatedSearchArticlesDto,
  SearchFacetDto,
  FacetValueDto,
  AttributeFacetDto,
  AttributeFacetValueDto,
  CategoryNavigationDto,
  CategoryOptionDto,
  ArticleAutocompleteItemDto,
  CategoryAutocompleteItemDto,
  AutocompleteItemDto,
  TermAutocompleteItemDto,
} from '@vp-parts-shop/shared';
import {
  TecDocTransport,
  TecDocArticleRecord,
  mapArticleSummary,
} from '../tecdoc';
import {
  SearchExecution,
  SearchFilters,
  DEFAULT_SEARCH_EXECUTION,
  DEFAULT_AUTOCOMPLETE_EXECUTION,
  AUTOCOMPLETE_SUGGESTIONS_LIMIT,
  CATEGORY_AUTOCOMPLETE_LIMIT,
  attributeRoleFor,
} from './search-types';

/**
 * One technical-attribute (criteria) facet block from a `getArticles`
 * `includeCriteriaFacets` response: the criterion metadata plus the value
 * counts over the match set. [VERIFY-TC] exact field names.
 */
interface TecDocCriteriaFacetCount {
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
interface TecDocAssemblyGroupFacetCount {
  assemblyGroupNodeId: number;
  assemblyGroupName: string;
  parentNodeId?: number | null;
  childCount?: number;
  count?: number;
}

/**
 * TecDoc source for the search surfaces: number/free-text article search (with
 * brand, technical-attribute, and single-level category-navigation facets) and
 * autocomplete. Both are `getArticles` calls; the shared
 * {@link mapArticleSummary} maps the article rows and the private mappers turn
 * the TecDoc facet blocks into the shared facet DTOs.
 */
@Injectable()
export class SearchTecDoc {
  constructor(private readonly transport: TecDocTransport) {}

  /**
   * Free-text/number search (searchType 10 — "any number"). Always asks TecDoc
   * for the brand (`dataSupplier`) facet and the hierarchical category
   * (`assemblyGroup`) tree over the whole match set, and forwards any active
   * selections as `dataSupplierIds` / `assemblyGroupNodeIds` / `criteriaFilters`.
   *
   * Technical-attribute (`criteria`) facets are **gated on landing at a leaf
   * category**: `includeCriteriaFacets` is requested only when a category is
   * selected (never on a broad search), and the returned criteria are surfaced
   * only when the selected node is a leaf (`current.hasChildren === false`).
   *
   * Results keep TecDoc's native article order — no client-side ranking.
   */
  async searchArticles(
    query: string,
    vehicleId?: string,
    execution: SearchExecution = DEFAULT_SEARCH_EXECUTION,
    page = 1,
    pageSize = 50,
    filters?: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    const categorySelected = Boolean(filters?.categoryNodeId);

    const data = await this.transport.call<{
      totalMatchingArticles: number;
      articles: TecDocArticleRecord[];
      dataSupplierFacets?: {
        counts: Array<{
          dataSupplierId: number;
          mfrName: string;
          count: number;
        }>;
      };
      criteriaFacets?: {
        counts: Array<TecDocCriteriaFacetCount>;
      };
      assemblyGroupFacets?: {
        counts: Array<TecDocAssemblyGroupFacetCount>;
      };
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: query,
      searchType: execution.type,
      // Free-text (type 99) ignores match strategy; only number searches use it.
      ...(execution.matchType != null && {
        searchMatchType: execution.matchType,
      }),
      perPage: pageSize,
      page,
      includeAll: true,
      includeDataSupplierFacets: true,
      // Only worth the payload once the search is scoped to a category; a broad
      // search's criteria would span unrelated product types.
      // TODO(search-ux): auto-surface dimensions when a precise query (e.g. a
      // full part number) collapses to a single leaf category, so the user need
      // not click to reveal them. Preferred approach: keep this broad call cheap
      // and, when categoryNavigation resolves to exactly one leaf option, fire
      // one follow-up scoped getArticles for its criteria (Redis-cached).
      ...(categorySelected && { includeCriteriaFacets: true }),
      // Match-scoped category facet: only the assembly groups present in the
      // result set, with article counts — NOT the whole catalogue tree
      // (that is getAssemblyGroupTree's job). `assemblyGroupType: 'P'` scopes to
      // passenger cars, matching getAssemblyGroupTree.
      assemblyGroupFacetOptions: {
        enabled: true,
        assemblyGroupType: 'P',
        includeCompleteTree: false,
      },
      ...(vehicleId != null && {
        linkageTargetType: 'P',
        linkageTargetId: Number(vehicleId),
      }),
      ...(filters?.brandIds?.length && {
        dataSupplierIds: filters.brandIds.map(Number),
      }),
      ...(filters?.categoryNodeId && {
        assemblyGroupNodeIds: [Number(filters.categoryNodeId)],
      }),
      ...(filters?.criteria?.length && {
        criteriaFilters: filters.criteria.map((c) => ({
          criteriaId: Number(c.criteriaId),
          rawValue: c.rawValue,
        })),
      }),
    });

    const categoryNavigation = this.buildCategoryNavigation(
      data.assemblyGroupFacets?.counts,
      filters?.categoryNodeId,
    );

    // A selected leaf category has coherent criteria, so surface the attribute
    // facets. Prefer the current node's own `hasChildren` (which also honours
    // TecDoc's childCount, so a node whose children were not returned is still
    // treated as a non-leaf); fall back to "no options" only when TecDoc omitted
    // the selected node from the scoped facet entirely.
    const atLeaf =
      categorySelected &&
      (categoryNavigation.current
        ? !categoryNavigation.current.hasChildren
        : categoryNavigation.options.length === 0);

    return {
      total: data.totalMatchingArticles,
      page,
      pageSize,
      items: (data.articles ?? []).map((article) => mapArticleSummary(article)),
      facets: this.mapBrandFacets(data.dataSupplierFacets?.counts),
      attributes: atLeaf
        ? this.mapAttributeFacets(data.criteriaFacets?.counts)
        : [],
      categoryNavigation,
    };
  }

  /**
   * Article autocomplete for a part-number / exact search: a short `getArticles`
   * number lookup (`searchType 10`) capped at {@link AUTOCOMPLETE_SUGGESTIONS_LIMIT}.
   * The {@link SearchExecution}'s `matchType` selects the strategy — `prefix`
   * for a live part-number dropdown, `exact` for the exact-number toggle — so
   * the suggestion set matches how the search itself will run.
   *
   * The same call enables `assemblyGroupFacetOptions`, so its response also
   * carries the categories the whole match set falls into (not just the shown
   * articles). Those become InterCars-style `category` suggestions — but only
   * when the matches span more than one category (see
   * {@link buildCategorySuggestions}); a homogeneous result (e.g. an exact
   * number) yields none, keeping the dropdown clean.
   */
  async getAutocompleteArticles(
    query: string,
    execution: SearchExecution = DEFAULT_AUTOCOMPLETE_EXECUTION,
  ): Promise<AutocompleteItemDto[]> {
    const data = await this.transport.call<{
      totalMatchingArticles: number;
      articles: Array<{
        articleNumber: string;
        mfrName: string;
        genericArticles: Array<{ genericArticleDescription: string }>;
      }>;
      assemblyGroupFacets?: {
        counts: Array<TecDocAssemblyGroupFacetCount>;
      };
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: query,
      searchType: execution.type,
      ...(execution.matchType != null && {
        searchMatchType: execution.matchType,
      }),
      perPage: AUTOCOMPLETE_SUGGESTIONS_LIMIT,
      page: 1,
      // Match-scoped category facet: the assembly groups present across the
      // whole result set (not only the shown page), with article counts — the
      // source for the `category` suggestions below.
      assemblyGroupFacetOptions: {
        enabled: true,
        assemblyGroupType: 'P',
        includeCompleteTree: false,
      },
    });

    const articles: ArticleAutocompleteItemDto[] = (data.articles ?? []).map(
      (article) => ({
        kind: 'article',
        articleNumber: article.articleNumber,
        brandName: article.mfrName,
        description:
          article.genericArticles[0]?.genericArticleDescription ?? '',
      }),
    );

    const categories = this.buildCategorySuggestions(
      query,
      data.assemblyGroupFacets?.counts,
    );

    return [...articles, ...categories];
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
  private buildCategorySuggestions(
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

  /**
   * Free-text term autocomplete for a generic search: TecDoc
   * `getAutoCompleteSuggestions` returns the description strings (article /
   * manufacturer / assembly-group) that match the typed input, meant to be fed
   * back as a `searchType 99` query — so a selected term re-runs a generic
   * search rather than deep-linking to one article.
   *
   * [VERIFY-TC] The request param (`searchQuery`) and response shape
   * (`suggestions[].description`) are best-effort: the onboarding guide (§5.3)
   * documents the function's purpose but defers the field names to the Pegasus
   * 3.0 Test Client. Confirm both against the Service Index before relying on
   * live data; the mapping tolerates a missing array but not a renamed field.
   */
  async getAutocompleteTerms(
    query: string,
  ): Promise<TermAutocompleteItemDto[]> {
    const data = await this.transport.call<{
      suggestions?: Array<{ description: string }>;
    }>('getAutoCompleteSuggestions', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: query,
      perPage: AUTOCOMPLETE_SUGGESTIONS_LIMIT,
      page: 1,
    });

    return (data.suggestions ?? [])
      .map((suggestion) => suggestion.description)
      .filter((term): term is string => Boolean(term))
      .map((term) => ({ kind: 'term', term }));
  }

  /**
   * Turns the raw TecDoc brand facet counts into the shared brand facet group.
   * Values carry a `dataSupplierId` id (so a selection maps back to the
   * `dataSupplierIds` filter) with the logo left null for the brands layer to
   * join. An empty group is dropped so the response only advertises a facet the
   * user can actually apply.
   */
  private mapBrandFacets(
    brandCounts: Array<{
      dataSupplierId: number;
      mfrName: string;
      count: number;
    }> = [],
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
  private mapAttributeFacets(
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
  private buildCategoryNavigation(
    counts: TecDocAssemblyGroupFacetCount[] = [],
    selectedNodeId?: string,
  ): CategoryNavigationDto {
    const ROOT_KEY = '__root__';
    const nodeById = new Map<string, TecDocAssemblyGroupFacetCount>();
    const childrenByParent = new Map<string, TecDocAssemblyGroupFacetCount[]>();

    for (const raw of counts) {
      nodeById.set(String(raw.assemblyGroupNodeId), raw);
    }

    for (const raw of counts) {
      const parentId =
        raw.parentNodeId != null ? String(raw.parentNodeId) : null;
      const key =
        parentId != null && nodeById.has(parentId) ? parentId : ROOT_KEY;
      const siblings = childrenByParent.get(key) ?? [];
      siblings.push(raw);
      childrenByParent.set(key, siblings);
    }

    const toOption = (
      raw: TecDocAssemblyGroupFacetCount,
    ): CategoryOptionDto => {
      const id = String(raw.assemblyGroupNodeId);
      const childList = childrenByParent.get(id) ?? [];
      return {
        id,
        label: raw.assemblyGroupName,
        count: raw.count ?? null,
        hasChildren: childList.length > 0 || (raw.childCount ?? 0) > 0,
      };
    };

    const optionSource = selectedNodeId
      ? (childrenByParent.get(selectedNodeId) ?? [])
      : (childrenByParent.get(ROOT_KEY) ?? []);
    const options = optionSource.map(toOption);

    const currentRaw = selectedNodeId
      ? nodeById.get(selectedNodeId)
      : undefined;
    const current = currentRaw ? toOption(currentRaw) : null;

    return { current, options };
  }
}
