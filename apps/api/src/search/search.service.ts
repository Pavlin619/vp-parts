import { Injectable, Logger } from '@nestjs/common';
import {
  ArticleAutocompleteItemDto,
  CategoryNavigationDto,
  SearchResponseDto,
} from '@vp-parts-shop/shared';
import {
  BRAND_MEMO_RETRY_AFTER_MS,
  BRAND_MEMO_TTL_MS,
  BrandsService,
} from '../catalog/brands';
import { TtlMemo } from '../common';
import { DEFAULT_SEARCH_MODE, SearchFilters, SearchMode } from './search-types';
import { buildSearchPlan } from './search-plan';
import { SearchLaneResolver } from './search-lane-resolver';
import { AutocompleteService } from './autocomplete.service';
import { buildBrandTokenSet } from './brand-dictionary';
import { parseQuery, ParsedQuery } from './query-parser';
import { SEARCH_DEFAULT_PAGE, SEARCH_DEFAULT_PAGE_SIZE } from './search.dto';

/**
 * Orchestrates a search: parse the query, expand it into a TecDoc call plan,
 * hand that to the lane resolver, and assemble the response. The TecDoc calls,
 * their caching and the suggestion surfaces each live behind their own
 * collaborator so this reads as the sequence of steps and nothing else.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  private readonly brandTokens = new TtlMemo({
    name: 'Brand dictionary',
    ttlMs: BRAND_MEMO_TTL_MS,
    retryAfterMs: BRAND_MEMO_RETRY_AFTER_MS,
    load: async () => buildBrandTokenSet(await this.brands.getBrands()),
  });

  constructor(
    private readonly lanes: SearchLaneResolver,
    private readonly autocompleteService: AutocompleteService,
    private readonly brands: BrandsService,
  ) {}

  async search(
    query: string,
    vehicleId?: number,
    page: number = SEARCH_DEFAULT_PAGE,
    pageSize: number = SEARCH_DEFAULT_PAGE_SIZE,
    filters: SearchFilters = {},
    searchMode: SearchMode = DEFAULT_SEARCH_MODE,
  ): Promise<SearchResponseDto> {
    const rawQuery = query.trim();
    const parsed = await this.parse(rawQuery);
    const plan = buildSearchPlan(parsed, searchMode);

    const result = await this.lanes.execute(plan, {
      vehicleId,
      page,
      pageSize,
      filters,
    });

    if (result.total === 0) {
      this.logZeroResult(rawQuery, parsed.brandStripped, vehicleId);
    }

    const suggestions = await this.suggestionsFor(result.total, rawQuery);

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
   * Removes a leading/trailing brand token (e.g. "WA5432 WIX" → "WA5432") using
   * a dictionary built from TecDoc `getBrands()`. Fails soft: if the brand list
   * is unavailable, search still runs on the query as typed rather than 500ing.
   */
  private async parse(rawQuery: string): Promise<ParsedQuery> {
    try {
      return parseQuery(rawQuery, await this.brandTokens.get());
    } catch {
      this.logger.warn(
        'Brand dictionary unavailable; searching the query as typed',
      );
      return { raw: rawQuery, brandStripped: rawQuery };
    }
  }

  private suggestionsFor(
    total: number,
    query: string,
  ): Promise<ArticleAutocompleteItemDto[]> {
    if (total > 0) {
      return Promise.resolve([]);
    }

    return this.autocompleteService.suggestForZeroResults(query);
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
   * Records a query that produced no results so we can later analyse the real
   * miss patterns (and decide whether a fuzzy fallback is ever worth building)
   * without mirroring TecDoc data into our own store.
   */
  private logZeroResult(
    query: string,
    brandStripped: string,
    vehicleId: number | undefined,
  ): void {
    this.logger.log(
      `search_zero_result query=${JSON.stringify(query)} ` +
        `brandStripped=${JSON.stringify(brandStripped)} ` +
        `vehicleScoped=${vehicleId != null}`,
    );
  }
}
