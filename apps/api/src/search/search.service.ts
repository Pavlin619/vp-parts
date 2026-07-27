import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ArticleAutocompleteItemDto,
  AutocompleteItemDto,
  CategoryNavigationDto,
  PaginatedSearchArticlesDto,
  SearchResponseDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../redis';
import { BrandsService } from '../catalog/brands';
import {
  CATEGORY_AUTOCOMPLETE_LIMIT,
  DEFAULT_AUTOCOMPLETE_EXECUTION,
  DEFAULT_SEARCH_MODE,
  EXACT_AUTOCOMPLETE_EXECUTION,
  hasActiveFilters,
  SearchExecution,
  SearchFilters,
  SearchMode,
  shouldRequestCriteriaFacets,
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
const SEARCH_MISS_TTL = 5 * 60;
/**
 * How long a resolved lane stays pinned. Matches {@link SEARCH_TTL} so a memo
 * and the search entries it points at age out together.
 */
const SEARCH_LANE_TTL = SEARCH_TTL;
const AUTOCOMPLETE_TTL = 15 * 60;
const AUTOCOMPLETE_MISS_TTL = 5 * 60;

/**
 * The one request the lane probe ever makes: the unnarrowed first page. Fixing
 * it is what makes the winning lane a property of the query alone — the
 * caller's filters and page can never influence which lane wins — and it is the
 * page every user loads before they can filter or paginate, so it is also the
 * warmest key in the search cache.
 */
const LANE_PROBE_PAGE = SEARCH_DEFAULT_PAGE;
const LANE_PROBE_PAGE_SIZE = SEARCH_DEFAULT_PAGE_SIZE;
const LANE_PROBE_FILTERS: SearchFilters = Object.freeze({});

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

/**
 * The outcome of probing a plan: the step that produced a non-empty total — the
 * "lane" — or `null` when every step came back empty, plus the probe page it
 * returned so an unnarrowed first-page request needs no second call.
 */
interface ResolvedSearch {
  result: PaginatedSearchArticlesDto;
  lane: SearchPlanStep | null;
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
    searchMode: SearchMode = DEFAULT_SEARCH_MODE,
  ): Promise<SearchResponseDto> {
    const rawQuery = query.trim();
    const parsed = await this.parse(rawQuery);
    const plan = this.buildSearchPlan(parsed, searchMode);

    const result = await this.executePlan(
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
   * Live autocomplete for the search bar. The client-selected {@link SearchMode}
   * (the same toggle that drives {@link search}) picks the TecDoc source so the
   * dropdown matches how the search will run:
   * - `generic` → free-text term suggestions (`getAutoCompleteSuggestions`); a
   *   selected term re-runs a generic search.
   * - `part_number_exact` → exact-number article suggestions.
   * - `part_number` (default) → prefix-number article suggestions.
   */
  async autocomplete(
    query: string,
    searchMode: SearchMode = DEFAULT_SEARCH_MODE,
  ): Promise<AutocompleteItemDto[]> {
    const searchQuery = query.trim();
    if (searchQuery.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    const suggestions = await this.autocompleteCached(searchQuery, searchMode);

    return this.capSuggestions(suggestions);
  }

  /**
   * Caps each suggestion kind independently so the article and term dropdowns
   * keep their limit while the appended category rows (part-number mode) are not
   * counted against — nor allowed to blow past — the article cap. Order is
   * preserved: the primary hits (articles or terms) come first, the category
   * rows after.
   */
  private capSuggestions(
    suggestions: AutocompleteItemDto[],
  ): AutocompleteItemDto[] {
    const primary = suggestions
      .filter((item) => item.kind !== 'category')
      .slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
    const categories = suggestions
      .filter((item) => item.kind === 'category')
      .slice(0, CATEGORY_AUTOCOMPLETE_LIMIT);

    return [...primary, ...categories];
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
   * Expands a parsed query + the client-selected {@link SearchMode} into the
   * ordered TecDoc calls to attempt. The mode is chosen up front on the FE, so
   * we no longer guess number-vs-text: each mode maps to a distinct, minimal
   * plan and the first call with a non-empty total wins (see {@link probePlan}).
   *
   * - `generic` → a single `searchType 99` free-text call over the **raw**
   *   query. No brand stripping, no number lane.
   * - `part_number_exact` → a single `searchType 10` / `exact` call over the
   *   **raw** query. No brand stripping, no fallback: an exact request is a
   *   precise lookup.
   * - `part_number` (default) → `searchType 10` / `prefix_or_suffix` over the
   *   brand-stripped query, then the raw query if it differs (the "brand" token
   *   may have been part of the number). No free-text fallback — a descriptive
   *   query belongs in `generic`.
   */
  private buildSearchPlan(
    parsed: ParsedQuery,
    searchMode: SearchMode,
  ): SearchPlanStep[] {
    if (searchMode === SearchMode.Generic) {
      return [
        { query: parsed.raw, execution: { type: TecDocSearchType.FreeText } },
      ];
    }

    if (searchMode === SearchMode.PartNumberExact) {
      return [
        {
          query: parsed.raw,
          execution: {
            type: TecDocSearchType.AnyNumber,
            matchType: 'exact',
          },
        },
      ];
    }

    const numberCandidates =
      parsed.raw === parsed.brandStripped
        ? [parsed.brandStripped]
        : [parsed.brandStripped, parsed.raw];

    const numberExecution: SearchExecution = {
      type: TecDocSearchType.AnyNumber,
      matchType: 'prefix_or_suffix',
    };

    return numberCandidates.map((query) => ({
      query,
      execution: numberExecution,
    }));
  }

  /**
   * Runs a search plan and returns the page the caller asked for.
   *
   * A single-step plan has no lane to choose, so it goes straight to TecDoc.
   * Only a `part_number` search whose brand token was stripped yields more than
   * one step; those first resolve which lane the query belongs to and then run
   * that one lane — never the whole plan — for the caller's page and filters.
   *
   * Resolving before narrowing is what keeps a filtered search honest. Filters
   * apply to every step, so a plan run with them would fall through a
   * legitimately emptied lane and answer from the other one, with facets
   * recomputed over a result set the user never saw. Resolving first makes an
   * emptied lane stay empty, which is the truthful answer for facets the user
   * picked from that lane.
   */
  private async executePlan(
    plan: SearchPlanStep[],
    vehicleId: string | undefined,
    page: number,
    pageSize: number,
    filters: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    if (plan.length === 1) {
      return this.executeStep(plan[0], vehicleId, page, pageSize, filters);
    }

    const { lane, result } = await this.resolveLane(plan, vehicleId);

    if (this.isLaneProbe(page, pageSize, filters)) {
      return result;
    }

    return this.executeStep(
      lane ?? plan[0],
      vehicleId,
      page,
      pageSize,
      filters,
    );
  }

  /**
   * Decides which lane the query belongs to by running the plan over the
   * {@link LANE_PROBE_PAGE} request until a step reports a non-empty total.
   * Because the probe is always unnarrowed, the answer depends on the query and
   * the vehicle scope alone — never on the caller's filters, and never on
   * whether Redis happens to hold a memo.
   *
   * The memo is therefore only an ordering hint: it moves the lane that won
   * last time to the front so the probe stops on its first step and the losing
   * call is never made. That makes the probe cheaper, never wrong — a lane that
   * has since gone empty simply loses again and the memo is rewritten. Pinning
   * it is still worth doing because the losing step is cached under the short
   * {@link SEARCH_MISS_TTL}, so without the memo that call would come back
   * every few minutes.
   */
  private async resolveLane(
    plan: SearchPlanStep[],
    vehicleId: string | undefined,
  ): Promise<ResolvedSearch> {
    const laneKey = this.laneCacheKey(plan, vehicleId);
    const pinnedToken = await this.cache.readMemo<string>(laneKey);

    const probe = await this.probePlan(
      this.pinnedFirst(plan, pinnedToken),
      vehicleId,
    );

    const winningToken = probe.lane ? this.laneToken(probe.lane) : undefined;
    if (winningToken !== undefined && winningToken !== pinnedToken) {
      await this.cache.writeMemo(laneKey, winningToken, SEARCH_LANE_TTL);
    }

    return probe;
  }

  /**
   * The plan reordered to try the memoised lane first. A memo left over from a
   * plan that no longer exists — a changed brand dictionary, a different mode —
   * matches no step and leaves the order untouched.
   */
  private pinnedFirst(
    plan: SearchPlanStep[],
    pinnedToken: string | undefined,
  ): SearchPlanStep[] {
    if (pinnedToken === undefined) {
      return plan;
    }

    const isPinned = (step: SearchPlanStep): boolean =>
      this.laneToken(step) === pinnedToken;

    return [
      ...plan.filter(isPinned),
      ...plan.filter((step) => !isPinned(step)),
    ];
  }

  /**
   * Runs each planned TecDoc call over the probe request in order until one
   * returns a non-empty total, and reports which step that was. When a
   * vehicleId is given every call is scoped to it, so a lane that only matches
   * outside the selected vehicle correctly loses. The winning step's total,
   * facets, attributes and category navigation are authoritative for the whole
   * match set and are stable across pages.
   */
  private async probePlan(
    plan: SearchPlanStep[],
    vehicleId: string | undefined,
  ): Promise<ResolvedSearch> {
    let lastResult = this.emptyProbePage();

    for (const step of plan) {
      const result = await this.executeStep(
        step,
        vehicleId,
        LANE_PROBE_PAGE,
        LANE_PROBE_PAGE_SIZE,
        LANE_PROBE_FILTERS,
      );

      if (result.total > 0) {
        return { result, lane: step };
      }

      lastResult = result;
    }

    return { result: lastResult, lane: null };
  }

  /**
   * Whether the caller asked for exactly the page the probe already fetched, in
   * which case the probe's result is the answer and no second call is needed.
   * A bare `categoryHasChildren` hint does not disqualify it: the hint changes
   * nothing about the TecDoc request without a category to describe.
   */
  private isLaneProbe(
    page: number,
    pageSize: number,
    filters: SearchFilters,
  ): boolean {
    return (
      page === LANE_PROBE_PAGE &&
      pageSize === LANE_PROBE_PAGE_SIZE &&
      !hasActiveFilters(filters)
    );
  }

  private emptyProbePage(): PaginatedSearchArticlesDto {
    return {
      total: 0,
      page: LANE_PROBE_PAGE,
      pageSize: LANE_PROBE_PAGE_SIZE,
      items: [],
      facets: [],
      attributes: [],
      categoryNavigation: { current: null, options: [] },
    };
  }

  private executeStep(
    step: SearchPlanStep,
    vehicleId: string | undefined,
    page: number,
    pageSize: number,
    filters: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    return this.searchArticlesCached(
      step.query,
      vehicleId,
      step.execution,
      page,
      pageSize,
      filters,
    );
  }

  /**
   * Cache key for the lane memo. It deliberately leaves out the filters, the
   * page and the page size: the lane is a property of the query itself, so one
   * entry serves every refinement and every page of that search. The vehicle
   * scope is part of it because it changes which lane has matches.
   */
  private laneCacheKey(
    plan: SearchPlanStep[],
    vehicleId: string | undefined,
  ): string {
    const identity = {
      plan: plan.map((step) => ({
        query: this.laneToken(step),
        execution: step.execution,
      })),
      vehicleId: vehicleId ?? null,
    };
    const digest = createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex');

    return `tecdoc:search:lane:${digest}`;
  }

  /**
   * A lane's stored identity: its query in the same normalised form the search
   * cache key uses, so the same number typed in different cases shares one memo.
   */
  private laneToken(step: SearchPlanStep): string {
    return this.normaliseCacheQuery(step.query, step.execution.type);
  }

  /**
   * Redis-cached (1h hit / 5m empty-miss) TecDoc search, with brand logos
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
    const identity = {
      query: this.normaliseCacheQuery(query, execution.type),
      vehicleId: vehicleId ?? null,
      execution,
      page,
      pageSize,
      brandIds: [...(filters?.brandIds ?? [])].sort(),
      categoryNodeId: filters?.categoryNodeId ?? null,
      // The decision, not the raw `categoryHasChildren` hint: it is what
      // actually changes the TecDoc payload, so hints that resolve the same way
      // (absent and "has children") share one entry while an opted-in leaf gets
      // its own.
      criteriaFacets: shouldRequestCriteriaFacets(filters, page),
      criteria: [...(filters?.criteria ?? [])].sort((left, right) => {
        const leftKey = `${left.criteriaId}:${left.rawValue}`;
        const rightKey = `${right.criteriaId}:${right.rawValue}`;

        return leftKey.localeCompare(rightKey);
      }),
    };
    const digest = createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex');

    return `tecdoc:search:${digest}`;
  }

  /**
   * Zero-result "did you mean" recovery: on an empty result set, suggest real
   * articles whose number starts with the first few characters of the query
   * (the most common failure is a wrong/typoed ending). This is always an
   * article-prefix lookup regardless of the search mode — the no-results page
   * links each suggestion to an article detail page — so it uses its own cache
   * key, independent of the mode-scoped live autocomplete above.
   */
  private async buildSuggestions(
    total: number,
    query: string,
  ): Promise<ArticleAutocompleteItemDto[]> {
    if (total > 0) {
      return [];
    }

    const prefix = query.slice(0, SUGGESTION_PREFIX_LENGTH);
    if (prefix.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    const suggestions = await this.autocompleteArticlesCached(
      prefix,
      DEFAULT_AUTOCOMPLETE_EXECUTION,
    );

    // The no-results page links each suggestion to an article detail page, so
    // keep only the article rows (the article autocomplete may also carry
    // category suggestions, which have nowhere to land here).
    return suggestions.filter(
      (item): item is ArticleAutocompleteItemDto => item.kind === 'article',
    );
  }

  /**
   * Routes a live autocomplete request to the mode's TecDoc source (see
   * {@link autocomplete}). Each source is cached under a key that carries the
   * mode so a part-number, exact, and generic dropdown for the same input never
   * collide.
   */
  private autocompleteCached(
    query: string,
    searchMode: SearchMode,
  ): Promise<AutocompleteItemDto[]> {
    if (searchMode === SearchMode.Generic) {
      return this.autocompleteTermsCached(query);
    }

    const execution =
      searchMode === SearchMode.PartNumberExact
        ? EXACT_AUTOCOMPLETE_EXECUTION
        : DEFAULT_AUTOCOMPLETE_EXECUTION;

    return this.autocompleteArticlesCached(query, execution);
  }

  private autocompleteArticlesCached(
    query: string,
    execution: SearchExecution,
  ): Promise<AutocompleteItemDto[]> {
    const cacheQuery = this.normaliseCacheQuery(query, execution.type);

    return this.cache.cachedArray(
      `tecdoc:autocomplete:article:${execution.matchType ?? 'any'}:${cacheQuery}`,
      AUTOCOMPLETE_TTL,
      AUTOCOMPLETE_MISS_TTL,
      () => this.searchTecDoc.getAutocompleteArticles(query, execution),
    );
  }

  private autocompleteTermsCached(
    query: string,
  ): Promise<AutocompleteItemDto[]> {
    const cacheQuery = this.normaliseCacheQuery(
      query,
      TecDocSearchType.FreeText,
    );

    return this.cache.cachedArray(
      `tecdoc:autocomplete:term:${cacheQuery}`,
      AUTOCOMPLETE_TTL,
      AUTOCOMPLETE_MISS_TTL,
      () => this.searchTecDoc.getAutocompleteTerms(query),
    );
  }

  private normaliseCacheQuery(query: string, searchType: number): string {
    const trimmed = query.trim();

    return searchType === TecDocSearchType.FreeText
      ? trimmed.toLocaleLowerCase('bg-BG')
      : trimmed.toLocaleUpperCase('bg-BG');
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
