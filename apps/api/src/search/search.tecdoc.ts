import { Injectable } from '@nestjs/common';
import {
  PaginatedSearchArticlesDto,
  ArticleAutocompleteItemDto,
  AutocompleteItemDto,
  TermAutocompleteItemDto,
} from '@vp-parts-shop/shared';
import {
  AssemblyGroupType,
  LinkageTargetType,
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
  hasSingleProductType,
  shouldRequestCriteriaFacets,
} from './search-types';
import {
  buildCategoryNavigation,
  buildCategorySuggestions,
  mapAttributeFacets,
  mapBrandFacets,
  mapProductTypeFacets,
  TecDocAssemblyGroupFacetCount,
  TecDocBrandFacetCount,
  TecDocCriteriaFacetCount,
  TecDocGenericArticleFacetCount,
} from './search-facet-mappers';

/**
 * The passenger-car and universal assembly-group trees in one request. TecDoc
 * concatenates the codes (see {@link AssemblyGroupType}), and both are needed
 * for a catalogue-wide search: oils, wipers and workshop consumables are filed
 * under Universal, so asking for the passenger-car tree alone returns those
 * articles as results while offering no category to narrow them by.
 */
const CATALOGUE_WIDE_TREES = `${AssemblyGroupType.PassengerCar}${AssemblyGroupType.Universal}`;

/**
 * The match-scoped category facet: only the assembly groups present in the
 * result set, with article counts — NOT the whole catalogue tree (that is
 * `getAssemblyGroupTree`'s job).
 *
 * `assemblyGroupType` is named only for a catalogue-wide search, where there is
 * no linkage for TecDoc to infer a tree from. Under a vehicle it is left unset
 * on purpose: the schema says the field "will automatically default to the
 * matching assemblyGroupType" when a `linkageTargetType` is given, and TecDoc's
 * own match is the one to trust — the two vocabularies do not line up (linkage
 * `'P'` covers motorcycles, tree `'P'` excludes them), so naming a tree here
 * would quietly drop part of the linkage's own catalogue.
 *
 * `includeCompleteTree` is asked for **only once a category is selected**. The
 * schema defines it as "Always return the complete tree back, even if other
 * assemblyGroupsIds are being filtered", so under an `assemblyGroupNodeIds`
 * filter the facet is otherwise anchored on the selected node and never names
 * its ancestors — which is exactly the trail the breadcrumb walks. An
 * unnarrowed search needs no such thing: it already receives the roots, and
 * asking for the whole catalogue tree on every broad query would be paid for on
 * the calls that can least afford it.
 *
 * [VERIFY-TC] `maxDepth` is left unset. The navigation is single-level, so one
 * level below the current node is all we read, but the schema documents the
 * field as "a limit to the number of edges … Defaults to 1 (no limit, full
 * tree)" — under which 1 is a sentinel for unlimited and no documented value
 * asks for one level. Confirm against the Test Client before setting it:
 * guessing risks an empty category facet.
 */
function assemblyGroupFacetOptionsFor(
  vehicleId: number | undefined,
  hasCategorySelection = false,
): Record<string, unknown> {
  return {
    enabled: true,
    includeCompleteTree: hasCategorySelection,
    ...(vehicleId == null && { assemblyGroupType: CATALOGUE_WIDE_TREES }),
  };
}

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
   * for the brand (`dataSupplier`) and product-type (`genericArticle`) facets
   * and the hierarchical category (`assemblyGroup`) tree over the whole match
   * set, and forwards any active selections as `dataSupplierIds` /
   * `genericArticleIds` / `assemblyGroupNodeIds` / `criteriaFilters`.
   *
   * Technical-attribute (`criteria`) facets are **gated on a homogeneous result
   * set**, on both sides of the call: the request asks for them only when
   * `shouldRequestCriteriaFacets` says they are worth computing, and the
   * response surfaces them only when the narrowing actually held. The request
   * gate is the optimisation — it keeps TecDoc from building a large criteria
   * block spanning unrelated product types — while the response gate is the
   * correctness backstop.
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
      maxAllowedPage?: number;
      articles?: TecDocArticleRecord[];
      dataSupplierFacets?: { counts: TecDocBrandFacetCount[] };
      genericArticleFacets?: { counts: TecDocGenericArticleFacetCount[] };
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

    const isHomogeneous = this.hasCoherentCriteria(categoryNavigation, filters);
    const items = (data.articles ?? []).map((article) =>
      mapArticleSummary(article),
    );

    // The lane resolver reads `total > 0` to decide a lane matched, so an
    // absent total must not read as "no matches" for a page that did return
    // articles. Falling back to the page keeps the two consistent.
    const total = data.totalMatchingArticles ?? items.length;

    return {
      total,
      page,
      pageSize,
      maxPage: this.resolveMaxPage(data.maxAllowedPage, total, pageSize),
      items,
      facets: [
        ...mapBrandFacets(data.dataSupplierFacets?.counts),
        ...mapProductTypeFacets(data.genericArticleFacets?.counts),
      ],
      attributes: isHomogeneous
        ? mapAttributeFacets(data.criteriaFacets?.counts)
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
        dataSupplierId: number;
        mfrName: string;
        // Optional on both counts: TecDoc omits the array unless
        // `includeGenericArticles` asks for it, and a part it files no generic
        // article against carries none even then.
        genericArticles?: Array<{ genericArticleDescription?: string }>;
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
      // What each suggestion is called ("Маслен филтър"). Requested on its own
      // rather than via `includeAll`, which would pull images, PDFs, OE and
      // trade numbers for every row of a dropdown that shows none of them.
      includeGenericArticles: true,
      // The assembly groups present across the whole result set (not only the
      // shown page) — the source for the `category` suggestions below.
      // Autocomplete is never vehicle-scoped, so it always spans both trees.
      assemblyGroupFacetOptions: assemblyGroupFacetOptionsFor(undefined),
    });

    const articles: ArticleAutocompleteItemDto[] = (data.articles ?? []).map(
      (article) => ({
        kind: 'article',
        articleNumber: article.articleNumber,
        // Carried so a suggestion can deep-link the part: the number alone does
        // not identify one.
        brandId: String(article.dataSupplierId),
        brandName: article.mfrName,
        description:
          article.genericArticles?.[0]?.genericArticleDescription ?? '',
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
   * Unlike `getArticles`, this function takes no `articleCountry` and no paging
   * params — `provider`, `lang` and `searchQuery` are its whole request — so
   * the dropdown's cap is applied here rather than asked of TecDoc.
   */
  async getAutocompleteTerms(
    query: string,
  ): Promise<TermAutocompleteItemDto[]> {
    const data = await this.transport.call<{
      suggestions?: string[];
    }>('getAutoCompleteSuggestions', {
      lang: 'bg',
      searchQuery: query,
    });

    return (data.suggestions ?? [])
      .filter((term) => Boolean(term))
      .slice(0, AUTOCOMPLETE_SUGGESTIONS_LIMIT)
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
      // Exactly what `mapArticleSummary` reads, and nothing more. The identity
      // it also needs — number, `dataSupplierId`, `mfrName` — comes back
      // unasked. `includeAll` would add PDFs, links, linkages, parts and
      // accessory lists, GTINs, prices, trade numbers and OE numbers that no
      // row renders, for a measured 25–58% of the response.
      includeGenericArticles: true,
      includeImages: true,
      includeArticleCriteria: true,
      includeDataSupplierFacets: true,
      includeGenericArticleFacets: true,
      // TODO(search-ux): auto-surface dimensions when a precise query (e.g. a
      // full part number) collapses to a single leaf category, so the user need
      // not click to reveal them. Preferred approach: keep this broad call cheap
      // and, when categoryNavigation resolves to exactly one leaf option, fire
      // one follow-up scoped getArticles for its criteria (Redis-cached).
      ...(shouldRequestCriteriaFacets(filters, page) && {
        includeCriteriaFacets: true,
      }),
      // Makes TecDoc rule on whether each key-table criteria value is
      // permissible for the selected product type. It marks rather than
      // filters: the verdict lands on each value's `permittedKeyValue`, which
      // `mapAttributeFacets` is what actually drops. Gated on exactly one
      // genericArticleId, as the schema requires for the flag to be populated.
      ...(hasSingleProductType(filters) && { applyDqmRules: true }),
      assemblyGroupFacetOptions: assemblyGroupFacetOptionsFor(
        vehicleId,
        filters?.categoryNodeId !== undefined,
      ),
      ...(vehicleId != null && {
        linkageTargetType: LinkageTargetType.Vehicle,
        linkageTargetId: vehicleId,
      }),
      ...(filters?.brandIds?.length && {
        dataSupplierIds: filters.brandIds,
      }),
      ...(filters?.productTypeIds?.length && {
        genericArticleIds: filters.productTypeIds,
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
   * The highest page this query can actually be paged to.
   *
   * TecDoc serves only the first ~10,000 results of any match set and reports
   * the resulting bound as `maxAllowedPage`, which shrinks as `perPage` grows.
   * A broad free-text query can therefore report millions of matches while
   * refusing anything past page 500, so `total / pageSize` would size a pager
   * out of pages TecDoc will not serve.
   *
   * Taking the lower of the two is belt and braces: TecDoc already factors the
   * result count into its cap, so the minimum only guards against it not doing
   * so. The fallback covers the field being absent, which the schema says
   * cannot happen but the untyped JSON transport cannot promise.
   */
  private resolveMaxPage(
    maxAllowedPage: number | undefined,
    total: number,
    pageSize: number,
  ): number {
    const pageCount = Math.ceil(total / pageSize);

    return maxAllowedPage === undefined
      ? pageCount
      : Math.min(maxAllowedPage, pageCount);
  }

  /**
   * Whether the result set is narrow enough for the attribute facets to mean
   * something — the response-side half of the gate that
   * {@link shouldRequestCriteriaFacets} opens on the request.
   *
   * A single product type needs no confirming: it is a selection we hold, not a
   * property of the response. A category's leafness does, which is what
   * {@link isAtLeafCategory} reads back off the navigation.
   */
  private hasCoherentCriteria(
    navigation: {
      current: { hasChildren: boolean } | null;
      options: unknown[];
    },
    filters: SearchFilters | undefined,
  ): boolean {
    return (
      hasSingleProductType(filters) ||
      this.isAtLeafCategory(navigation, filters)
    );
  }

  /**
   * Whether the search landed on a leaf category.
   *
   * Prefers the current node's own `hasChildren` (which also honours TecDoc's
   * `children` count, so a node whose children were not returned is still
   * treated as a non-leaf); falls back to "no options" only when TecDoc omitted
   * the selected node from the scoped facet entirely.
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
