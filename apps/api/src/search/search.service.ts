import { Injectable, Logger } from '@nestjs/common';
import {
  AutocompleteItemDto,
  CategoryNavigationDto,
  PaginatedSearchArticlesDto,
  SearchResponseDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../redis';
import { BrandsService } from '../catalog/brands';
import {
  SearchExecution,
  SearchFilters,
  TecDocSearchType,
} from './search-types';
import { SearchTecDoc } from './search.tecdoc';
import { buildBrandTokenSet } from './brand-dictionary';
import { parseQuery, ParsedQuery } from './query-parser';
import { SEARCH_DEFAULT_PAGE, SEARCH_DEFAULT_PAGE_SIZE } from './search.dto';

const AUTOCOMPLETE_MIN_QUERY_LENGTH = 3;
const AUTOCOMPLETE_MAX_SUGGESTIONS = 8;
const SUGGESTION_PREFIX_LENGTH = 5;

const SEARCH_TTL = 60 * 60;
const SEARCH_MISS_TTL = 10 * 60;
const AUTOCOMPLETE_TTL = 30 * 60;

const DEFAULT_EXECUTION: SearchExecution = {
  type: TecDocSearchType.AnyNumber,
  matchType: 'prefix_or_suffix',
};

/**
 * One TecDoc call the search will attempt: the query string to send and the
 * {@link SearchExecution} (type + match strategy) to run it with. A mode expands
 * to an ordered list of these; the first with a non-empty total wins.
 */
interface SearchPlanStep {
  query: string;
  execution: SearchExecution;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly searchTecDoc: SearchTecDoc,
    private readonly brands: BrandsService,
    private readonly cache: RedisCache,
  ) {}

  async search(
    query: string,
    vehicleId?: string,
    page: number = SEARCH_DEFAULT_PAGE,
    pageSize: number = SEARCH_DEFAULT_PAGE_SIZE,
    filters: SearchFilters = {},
    exact = false,
  ): Promise<SearchResponseDto> {
    const rawQuery = query.trim();
    const parsed = await this.parse(rawQuery);
    const plan = this.buildSearchPlan(parsed, exact);

    const result = await this.executeSearchWithFallback(
      plan,
      vehicleId,
      page,
      pageSize,
      filters,
    );

    if (result.total === 0) {
      this.logZeroResult(rawQuery, parsed.brandStripped, vehicleId);
    }

    const suggestions = await this.buildSuggestions(result.total, rawQuery);

    // Results keep TecDoc's native article order — no client-side ranking.
    // [VERIFY-TC] Re-evaluate ordering against the Test Client (see the Phase
    // 3.5 plan checklist) before adding any internal sort.
    return {
      query,
      results: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      ...(result.facets.length > 0 && { facets: result.facets }),
      ...(result.attributes.length > 0 && { attributes: result.attributes }),
      ...(this.hasCategoryNavigation(result.categoryNavigation) && {
        categoryNavigation: result.categoryNavigation,
      }),
      ...(suggestions.length > 0 && { suggestions }),
    };
  }

  /**
   * The category navigation is worth returning only when it carries something to
   * render — a level to choose from or a resolved current node. A broad search
   * with no matched groups collapses to empty and is omitted, matching how the
   * brand/attribute facets are conditionally included.
   */
  private hasCategoryNavigation(navigation: CategoryNavigationDto): boolean {
    return navigation.options.length > 0 || navigation.current !== null;
  }

  async autocomplete(query: string): Promise<AutocompleteItemDto[]> {
    const searchQuery = query.trim();
    if (searchQuery.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    const suggestions = await this.autocompleteCached(searchQuery);

    return suggestions.slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
  }

  /**
   * Removes a leading/trailing brand token (e.g. "WA5432 WIX" → "WA5432") using
   * a dictionary built from TecDoc `getBrands()`. Fails soft: if the brand list
   * is unavailable, search still runs on the query as typed rather than 500ing.
   */
  private async parse(rawQuery: string): Promise<ParsedQuery> {
    try {
      const brandTokens = buildBrandTokenSet(await this.brands.getBrands());
      return parseQuery(rawQuery, brandTokens);
    } catch {
      this.logger.warn(
        'Brand dictionary unavailable; searching the query as typed',
      );
      return { raw: rawQuery, brandStripped: rawQuery };
    }
  }

  /**
   * Expands a parsed query + the exact toggle into the ordered TecDoc calls to
   * attempt. We deliberately do NOT classify number-vs-text up front: that
   * heuristic is unreliable, and since the number and free-text result sets are
   * near-disjoint, it is unnecessary. Instead the number lane is always tried
   * first, with a free-text fallback:
   *
   * - default → `searchType 10` / `prefix_or_suffix` over the brand-stripped
   *   query, then the raw query if it differs (the "brand" token may have been
   *   part of the number); if all miss, one `searchType 99` free-text call over
   *   the **raw** query. The brand is kept for free-text because it is valuable
   *   signal in a descriptive query ("oil filter bosch"). Up to 3 calls, but a
   *   real part number resolves on the first.
   * - exact toggle → `searchType 10` / `exact` over the same brand-stripped→raw
   *   candidates, with no free-text fallback: an exact-phrase request is a
   *   precise number lookup, kept as its own cheap bucket.
   *
   * The first call with a non-empty total wins (see executeSearchWithFallback).
   */
  private buildSearchPlan(
    parsed: ParsedQuery,
    exact: boolean,
  ): SearchPlanStep[] {
    const numberCandidates =
      parsed.raw === parsed.brandStripped
        ? [parsed.brandStripped]
        : [parsed.brandStripped, parsed.raw];

    if (exact) {
      const exactExecution: SearchExecution = {
        type: TecDocSearchType.AnyNumber,
        matchType: 'exact',
      };
      return numberCandidates.map((query) => ({
        query,
        execution: exactExecution,
      }));
    }

    const numberExecution: SearchExecution = {
      type: TecDocSearchType.AnyNumber,
      matchType: 'prefix_or_suffix',
    };

    return [
      ...numberCandidates.map((query) => ({
        query,
        execution: numberExecution,
      })),
      { query: parsed.raw, execution: { type: TecDocSearchType.FreeText } },
    ];
  }

  /**
   * Runs each planned TecDoc call in order until one returns a non-empty total.
   * When a vehicleId is given, every call is scoped to it so TecDoc returns only
   * parts that fit that vehicle (no separate fit lookup, no per-item badge).
   * Active facet `filters` are applied to every call. The first call with a
   * non-empty total wins; its total, facets, attributes and category navigation
   * are authoritative for pagination and are stable across pages.
   */
  private async executeSearchWithFallback(
    plan: SearchPlanStep[],
    vehicleId: string | undefined,
    page: number,
    pageSize: number,
    filters: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    let lastResult: PaginatedSearchArticlesDto = {
      total: 0,
      page,
      pageSize,
      items: [],
      facets: [],
      attributes: [],
      categoryNavigation: { current: null, options: [] },
    };

    for (const step of plan) {
      const result = await this.searchArticlesCached(
        step.query,
        vehicleId,
        step.execution,
        page,
        pageSize,
        filters,
      );

      if (result.total > 0) {
        return result;
      }

      lastResult = result;
    }

    return lastResult;
  }

  /**
   * Redis-cached (1h hit / 10m empty-miss) TecDoc search, with brand logos
   * joined onto the article rows and brand facet from the same cached brand
   * read. The cached payload is the raw TecDoc result (no logos); the logo join
   * is applied per request so a brand-logo change never needs a search-cache
   * bust.
   */
  private async searchArticlesCached(
    query: string,
    vehicleId: string | undefined,
    execution: SearchExecution,
    page: number,
    pageSize: number,
    filters: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    const raw = await this.cache.cachedPaginated(
      this.searchCacheKey(query, vehicleId, execution, page, pageSize, filters),
      SEARCH_TTL,
      SEARCH_MISS_TTL,
      () =>
        this.searchTecDoc.searchArticles(
          query,
          vehicleId,
          execution,
          page,
          pageSize,
          filters,
        ),
    );

    return this.brands.applyLogosToSearchResults(raw);
  }

  private searchCacheKey(
    query: string,
    vehicleId: string | undefined,
    execution: SearchExecution = DEFAULT_EXECUTION,
    page: number,
    pageSize: number,
    filters?: SearchFilters,
  ): string {
    const vehicleKey = vehicleId ?? 'none';
    const executionKey = `${execution.type}-${execution.matchType ?? 'any'}`;
    const brandKey = filters?.brandIds?.length
      ? filters.brandIds.join(',')
      : 'none';
    const categoryKey = filters?.categoryNodeId ?? 'none';
    const criteriaKey = filters?.criteria?.length
      ? filters.criteria.map((c) => `${c.criteriaId}=${c.rawValue}`).join(',')
      : 'none';

    return `tecdoc:search:${query}:${vehicleKey}:${executionKey}:${page}:${pageSize}:${brandKey}:${categoryKey}:${criteriaKey}`;
  }

  private async buildSuggestions(
    total: number,
    query: string,
  ): Promise<AutocompleteItemDto[]> {
    if (total > 0) {
      return [];
    }

    const prefix = query.slice(0, SUGGESTION_PREFIX_LENGTH);
    if (prefix.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    return this.autocompleteCached(prefix);
  }

  private autocompleteCached(query: string): Promise<AutocompleteItemDto[]> {
    return this.cache.cached(
      `tecdoc:autocomplete:${query}`,
      AUTOCOMPLETE_TTL,
      () => this.searchTecDoc.getAutocompleteSuggestions(query),
    );
  }

  /**
   * Records a query that produced no results so we can later analyse the real
   * miss patterns (and decide whether a fuzzy fallback is ever worth building)
   * without mirroring TecDoc data into our own store.
   */
  private logZeroResult(
    query: string,
    brandStripped: string,
    vehicleId: string | undefined,
  ): void {
    this.logger.log(
      `search_zero_result query=${JSON.stringify(query)} ` +
        `brandStripped=${JSON.stringify(brandStripped)} ` +
        `vehicleScoped=${vehicleId != null}`,
    );
  }
}
