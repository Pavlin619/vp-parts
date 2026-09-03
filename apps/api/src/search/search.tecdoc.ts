import { Injectable } from '@nestjs/common';
import {
  ArticleAutocompleteItemDto,
  ArticleSummaryDto,
  AutocompleteItemDto,
  SearchSort,
  TermAutocompleteItemDto,
} from '@vp-parts-shop/shared';
import {
  AssemblyGroupType,
  LinkageTargetType,
  TecDocTransport,
  TecDocArticleRecord,
  mapArticleCandidate,
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
import { SEARCH_SORTABLE_LIMIT, SearchEnumeration } from './search-enumeration';
import { SearchRequest } from './search-call';
import {
  buildCategoryNavigation,
  buildCategorySuggestions,
  mapBrandFacets,
  mapProductTypeFacets,
  TecDocAssemblyGroupFacetCount,
  TecDocBrandFacetCount,
  TecDocGenericArticleFacetCount,
} from './search-facet-mappers';
import {
  mapAttributeFacets,
  TecDocCriteriaFacetCount,
} from './dimension-facets';

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
 * `includeCompleteTree` is never asked for, and that is a measured decision
 * rather than a default. The schema defines it as "Always return the complete
 * tree back, even if other assemblyGroupsIds are being filtered", which reads
 * as though a filtered facet were anchored on the selected node with no way
 * back up — the trail the breadcrumb walks. It is not: a facet filtered to one
 * node answers with that node, its children *and* its complete ancestor chain
 * regardless of the flag (17 of 17 nodes at depths 2–4, catalogue-wide and
 * under a vehicle). All the flag adds is the rest of the catalogue tree, which
 * tripled the node count for nothing the navigation reads.
 *
 * `maxDepth` is left unset, which is what returns the full tree. The schema's
 * "Defaults to 1 (no limit, full tree)" is wrong on both halves: 1 is not a
 * sentinel for unlimited but the roots alone, and it is a count of levels
 * rather than of edges — 2 gives roots plus one level, 3 plus two, and **0
 * empties the facet entirely**. Unset and -1 both give everything. Setting it
 * to 2 would trim a broad search's facet, since only the roots are rendered and
 * `children` survives the trim; it is left off because the facet is cached per
 * search and is a small part of the entry either way.
 */
function assemblyGroupFacetOptionsFor(
  vehicleId: number | undefined,
): Record<string, unknown> {
  return {
    enabled: true,
    ...(vehicleId == null && { assemblyGroupType: CATALOGUE_WIDE_TREES }),
  };
}

/**
 * The TecDoc `sort` fields each catalogue axis maps to, in the order they are
 * applied. Only these two sorts reach TecDoc: the availability and price orders
 * rank on stock it knows nothing about, and `catalogue` *is* its own order, so
 * all four send no `sort` and take the relevance ranking as it comes.
 *
 * Two fields rather than one so a page boundary cannot fall inside a run of ties
 * and reshuffle on the next request — the same reason our own comparators end on
 * brand and number.
 */
const TECDOC_SORT_FIELDS: Partial<Record<SearchSort, readonly string[]>> = {
  [SearchSort.Brand]: ['mfrName', 'articleNumber'],
  [SearchSort.ArticleNumber]: ['articleNumber', 'mfrName'],
};

export interface TecDocSortField {
  field: string;
  direction: 'asc' | 'desc';
}

export function tecDocSortFor(sort: SearchSort): TecDocSortField[] | undefined {
  const fields = TECDOC_SORT_FIELDS[sort];

  return fields?.map((field) => ({ field, direction: 'asc' as const }));
}

/** One page of rendered rows, in TecDoc's own order. */
export interface SearchRowsPage {
  items: ArticleSummaryDto[];
  /**
   * TecDoc's paging ceiling for the page size it was asked with, so it is
   * already in the caller's units. Absent when TecDoc omitted it, which the
   * schema says cannot happen but the untyped JSON transport cannot promise.
   */
  maxAllowedPage?: number;
}

/**
 * TecDoc source for the search surfaces: the two reads behind a result page and
 * the two behind autocomplete. All are `getArticles` calls; the shared
 * {@link mapArticleSummary} maps the article rows and the pure mappers in
 * `search-facet-mappers` turn the TecDoc facet blocks into the shared DTOs.
 *
 * The result page is split in two because the two halves are wanted at
 * different granularities. {@link enumerate} reads the *whole* match set
 * cheaply, which is what the availability ranking needs and what every page of
 * one search shares; {@link readRowsPage} reads *one page* of rendered rows, and
 * is only ever reached for a set too wide to rank.
 */
@Injectable()
export class SearchTecDoc {
  constructor(private readonly transport: TecDocTransport) {}

  /**
   * The whole match set of a search, read as cheaply as TecDoc allows: what it
   * measures, what it can be narrowed by, and every article in it as an
   * identity.
   *
   * Always asks for the brand (`dataSupplier`) and product-type
   * (`genericArticle`) facets and the hierarchical category (`assemblyGroup`)
   * tree over the whole match set, and forwards any active selections as
   * `dataSupplierIds` / `genericArticleIds` / `assemblyGroupNodeIds` /
   * `criteriaFilters`.
   *
   * Technical-attribute (`criteria`) facets are **gated on a homogeneous result
   * set**, on both sides of the call: the request asks for them only when
   * `shouldRequestCriteriaFacets` says they are worth computing, and the
   * response surfaces them only when the narrowing actually held. The request
   * gate is the optimisation — it keeps TecDoc from building a large criteria
   * block spanning unrelated product types — while the response gate is the
   * correctness backstop.
   *
   * A set wider than {@link SEARCH_SORTABLE_LIMIT} answers with candidates that
   * are then discarded, because TecDoc will not count a set without also
   * naming its first page of it. That is the deliberate cost of one entry call
   * per search: a candidate is a fraction of a rendered row, and the entry is
   * cached without them.
   */
  async enumerate(
    query: string,
    vehicleId?: number,
    execution: SearchExecution = DEFAULT_SEARCH_EXECUTION,
    filters?: SearchFilters,
  ): Promise<SearchEnumeration> {
    const data = await this.transport.call<{
      // Optional like the collections below: TecDoc omits a field rather than
      // sending a zero or an empty one.
      totalMatchingArticles?: number;
      articles?: TecDocArticleRecord[];
      dataSupplierFacets?: { counts: TecDocBrandFacetCount[] };
      genericArticleFacets?: { counts: TecDocGenericArticleFacetCount[] };
      criteriaFacets?: { counts: TecDocCriteriaFacetCount[] };
      assemblyGroupFacets?: { counts: TecDocAssemblyGroupFacetCount[] };
    }>('getArticles', {
      ...this.matchSetPayload(query, vehicleId, execution, filters),
      perPage: SEARCH_SORTABLE_LIMIT,
      page: 1,
      // The candidate includes: what a part is called and the id it is hydrated
      // by (`includeGenericArticles`), and whether it is still supplied
      // (`includeMisc`). Its identity — number, `dataSupplierId`, `mfrName` —
      // comes back unasked. Images and criteria are what a *rendered* row needs
      // and cost ten times as much, so they are bought per page instead.
      includeGenericArticles: true,
      includeMisc: true,
      includeDataSupplierFacets: true,
      includeGenericArticleFacets: true,
      // Dimensions wait for a selection, and auto-surfacing them on a precise
      // query was measured and dropped. A match set never narrows to one
      // product type on its own: free text spans hundreds (`филтър` → 213), and
      // an exact number fans out over OE, trade and comparable numbers onto
      // kits and service sets as well as the bare part, so it lands on two to
      // six — `OX 389/1D` is 114 articles across 83 brands, 110 of them an oil
      // filter and 4 a filter kit. The gate held in 0 of 48 exact searches
      // sampled across eight product types; the only shapes that did collapse
      // held one or two articles, where no filter can change the result. So the
      // follow-up call this once planned would fire on a case that does not
      // occur, and where a number search does need an axis, the visitor's is
      // brand — 83 of them here, already in the sidebar.
      ...(shouldRequestCriteriaFacets(filters) && {
        includeCriteriaFacets: true,
      }),
      assemblyGroupFacetOptions: assemblyGroupFacetOptionsFor(vehicleId),
    });

    const categoryNavigation = buildCategoryNavigation(
      data.assemblyGroupFacets?.counts,
      filters?.categoryNodeId,
    );

    const isHomogeneous = this.hasCoherentCriteria(categoryNavigation, filters);
    const candidates = (data.articles ?? []).map(mapArticleCandidate);

    return {
      // `total` is what decides both "no results" and which tier the set is
      // served in, so an absent one must not read as "no matches" for a call
      // that did return articles. Falling back to the candidates keeps the two
      // consistent.
      total: data.totalMatchingArticles ?? candidates.length,
      candidates,
      facets: [
        ...mapBrandFacets(data.dataSupplierFacets?.counts),
        ...mapProductTypeFacets(
          data.genericArticleFacets?.counts,
          filters?.productTypeIds,
        ),
      ],
      attributes: isHomogeneous
        ? mapAttributeFacets(data.criteriaFacets?.counts, filters?.criteria)
        : [],
      categoryNavigation,
    };
  }

  /**
   * One page of rendered rows in a catalogue order — the answer for a match set
   * too wide to rank by what we can ship.
   *
   * Whether that order is TecDoc's own relevance or one of its alphabetical axes
   * is {@link tecDocSortFor}'s decision; either way TecDoc applies it across the
   * whole match set before paging, which is what makes an alphabetical sort
   * meaningful here at all while an availability one is not.
   *
   * Asks for no facets: the enumeration of the same set already carries them,
   * and it is cached per search rather than per page, so recomputing them here
   * would be paid for on every page turn of exactly the queries that can least
   * afford it.
   */
  async readRowsPage(request: SearchRequest): Promise<SearchRowsPage> {
    const sort = tecDocSortFor(request.sort);

    const data = await this.transport.call<{
      maxAllowedPage?: number;
      articles?: TecDocArticleRecord[];
    }>('getArticles', {
      ...this.matchSetPayload(
        request.query,
        request.vehicleId,
        request.execution,
        request.filters,
      ),
      perPage: request.pageSize,
      page: request.page,
      ...(sort && { sort }),
      // Exactly what `mapArticleSummary` reads, and nothing more. `includeAll`
      // would add PDFs, links, linkages, parts and accessory lists, GTINs,
      // prices, trade numbers and OE numbers that no row renders, for a
      // measured 25–58% of the response.
      includeGenericArticles: true,
      includeImages: true,
      includeArticleCriteria: true,
    });

    return {
      items: (data.articles ?? []).map((article) => mapArticleSummary(article)),
      maxAllowedPage: data.maxAllowedPage,
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
   * Everything that decides *which* articles a search matches: the query, the
   * vehicle scope and the active narrowings. Shared by the two reads above, so
   * they cannot drift into describing different match sets — the whole basis for
   * one of them owning the facets on the other's behalf.
   *
   * What each read adds to it is how much of each article it wants, and how many.
   */
  private matchSetPayload(
    query: string,
    vehicleId: number | undefined,
    execution: SearchExecution,
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
      // Makes TecDoc rule on whether each key-table criteria value is
      // permissible for the selected product type. It marks rather than
      // filters: the verdict lands on each value's `permittedKeyValue`, which
      // `mapAttributeFacets` is what actually drops. Gated on exactly one
      // genericArticleId, as the schema requires for the flag to be populated.
      ...(hasSingleProductType(filters) && { applyDqmRules: true }),
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
