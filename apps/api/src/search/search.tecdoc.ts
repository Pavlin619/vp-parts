import { Injectable } from '@nestjs/common';
import {
  PaginatedSearchArticlesDto,
  ArticleAutocompleteItemDto,
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
  shouldRequestCriteriaFacets,
} from './search-types';
import {
  buildCategoryNavigation,
  buildCategorySuggestions,
  mapAttributeFacets,
  mapBrandFacets,
  TecDocAssemblyGroupFacetCount,
  TecDocBrandFacetCount,
  TecDocCriteriaFacetCount,
} from './search-facet-mappers';

/**
 * TecDoc source for the search surfaces: number/free-text article search (with
 * brand, technical-attribute, and single-level category-navigation facets) and
 * autocomplete. Both are `getArticles` calls; the shared
 * {@link mapArticleSummary} maps the article rows and the pure mappers in
 * `search-facet-mappers` turn the TecDoc facet blocks into the shared DTOs.
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
   * category**, on both sides of the call: the request asks for them only when
   * `shouldRequestCriteriaFacets` says they are worth computing, and the
   * response surfaces them only when the selected node turns out to be a leaf
   * (`current.hasChildren === false`). The request gate is the optimisation —
   * it keeps TecDoc from building a large criteria block for a mid-level
   * subtree — while the response gate is the correctness backstop.
   *
   * Results keep TecDoc's native article order — no client-side ranking.
   */
  async searchArticles(
    query: string,
    vehicleId?: number,
    execution: SearchExecution = DEFAULT_SEARCH_EXECUTION,
    page = 1,
    pageSize = 50,
    filters?: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    const data = await this.transport.call<{
      // Optional like the collections below: TecDoc omits a field rather than
      // sending a zero or an empty one.
      totalMatchingArticles?: number;
      articles?: TecDocArticleRecord[];
      dataSupplierFacets?: { counts: TecDocBrandFacetCount[] };
      criteriaFacets?: { counts: TecDocCriteriaFacetCount[] };
      assemblyGroupFacets?: { counts: TecDocAssemblyGroupFacetCount[] };
    }>(
      'getArticles',
      this.searchPayload(query, vehicleId, execution, page, pageSize, filters),
    );

    const categoryNavigation = buildCategoryNavigation(
      data.assemblyGroupFacets?.counts,
      filters?.categoryNodeId,
    );

    const atLeaf = this.isAtLeafCategory(categoryNavigation, filters);
    const items = (data.articles ?? []).map((article) =>
      mapArticleSummary(article),
    );

    return {
      // The lane resolver reads `total > 0` to decide a lane matched, so an
      // absent total must not read as "no matches" for a page that did return
      // articles. Falling back to the page keeps the two consistent.
      total: data.totalMatchingArticles ?? items.length,
      page,
      pageSize,
      items,
      facets: mapBrandFacets(data.dataSupplierFacets?.counts),
      attributes: atLeaf ? mapAttributeFacets(data.criteriaFacets?.counts) : [],
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
      assemblyGroupFacets?: { counts: TecDocAssemblyGroupFacetCount[] };
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

    const categories = buildCategorySuggestions(
      query,
      data.assemblyGroupFacets?.counts,
    );

    return [...articles, ...categories];
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
   * The `getArticles` request body for a search. Kept separate from the
   * response handling above so the (long) list of TecDoc params reads as one
   * thing.
   */
  private searchPayload(
    query: string,
    vehicleId: number | undefined,
    execution: SearchExecution,
    page: number,
    pageSize: number,
    filters: SearchFilters | undefined,
  ): Record<string, unknown> {
    return {
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
      // TODO(search-ux): auto-surface dimensions when a precise query (e.g. a
      // full part number) collapses to a single leaf category, so the user need
      // not click to reveal them. Preferred approach: keep this broad call cheap
      // and, when categoryNavigation resolves to exactly one leaf option, fire
      // one follow-up scoped getArticles for its criteria (Redis-cached).
      ...(shouldRequestCriteriaFacets(filters, page) && {
        includeCriteriaFacets: true,
      }),
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
        linkageTargetId: vehicleId,
      }),
      ...(filters?.brandIds?.length && {
        dataSupplierIds: filters.brandIds,
      }),
      ...(filters?.categoryNodeId !== undefined && {
        assemblyGroupNodeIds: [filters.categoryNodeId],
      }),
      ...(filters?.criteria?.length && {
        criteriaFilters: filters.criteria,
      }),
    };
  }

  /**
   * Whether the search landed on a leaf category, which is what makes the
   * attribute facets coherent enough to surface.
   *
   * Prefers the current node's own `hasChildren` (which also honours TecDoc's
   * childCount, so a node whose children were not returned is still treated as
   * a non-leaf); falls back to "no options" only when TecDoc omitted the
   * selected node from the scoped facet entirely.
   */
  private isAtLeafCategory(
    navigation: {
      current: { hasChildren: boolean } | null;
      options: unknown[];
    },
    filters: SearchFilters | undefined,
  ): boolean {
    if (filters?.categoryNodeId === undefined) {
      return false;
    }

    return navigation.current
      ? !navigation.current.hasChildren
      : navigation.options.length === 0;
  }
}
