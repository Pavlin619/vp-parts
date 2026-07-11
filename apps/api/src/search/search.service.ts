import { Injectable, Logger } from '@nestjs/common';
import {
  ArticleSummaryDto,
  AutocompleteItemDto,
  PaginatedSearchArticlesDto,
  SearchResponseDto,
} from '@vp-parts-shop/shared';
import {
  SearchMatchType,
  SearchFilters,
} from '../catalog/tecdoc/tecdoc-client';
import { CatalogService } from '../catalog/catalog.service';
import { buildBrandTokenSet } from './brand-dictionary';
import { parseQuery, ParsedQuery } from './query-parser';
import { SEARCH_DEFAULT_PAGE, SEARCH_DEFAULT_PAGE_SIZE } from './search.dto';

const AUTOCOMPLETE_MIN_QUERY_LENGTH = 3;
const AUTOCOMPLETE_MAX_SUGGESTIONS = 8;
const SUGGESTION_PREFIX_LENGTH = 5;

/**
 * The precision-first tier order applied to each candidate query: an exact hit
 * ranks the searched number first when it exists; prefix_or_suffix then recovers
 * partial-number and suffix variants.
 */
const SEARCH_TIERS: SearchMatchType[] = ['exact', 'prefix_or_suffix'];

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly catalog: CatalogService) {}

  async search(
    query: string,
    vehicleId?: string,
    page: number = SEARCH_DEFAULT_PAGE,
    pageSize: number = SEARCH_DEFAULT_PAGE_SIZE,
    filters: SearchFilters = {},
  ): Promise<SearchResponseDto> {
    const rawQuery = query.trim();
    const parsed = await this.parse(rawQuery);

    const result = await this.executeSearchWithFallback(
      parsed,
      vehicleId,
      page,
      pageSize,
      filters,
    );

    const ranked = this.rankByBrand(result.items, parsed.brandHint);

    if (result.total === 0) {
      this.logZeroResult(rawQuery, parsed.brandStripped, vehicleId);
    }

    const suggestions = await this.buildSuggestions(result.total, rawQuery);

    return {
      query,
      results: ranked,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      ...(result.facets.length > 0 && { facets: result.facets }),
      ...(suggestions.length > 0 && { suggestions }),
    };
  }

  async autocomplete(query: string): Promise<AutocompleteItemDto[]> {
    const searchQuery = query.trim();
    if (searchQuery.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    const suggestions =
      await this.catalog.getAutocompleteSuggestions(searchQuery);

    return suggestions.slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
  }

  /**
   * Removes a leading/trailing brand token (e.g. "WA5432 WIX" → "WA5432") using
   * a dictionary built from TecDoc `getBrands()`. Fails soft: if the brand list
   * is unavailable, search still runs on the query as typed rather than 500ing.
   */
  private async parse(rawQuery: string): Promise<ParsedQuery> {
    try {
      const brandTokens = buildBrandTokenSet(await this.catalog.getBrands());
      return parseQuery(rawQuery, brandTokens);
    } catch {
      this.logger.warn(
        'Brand dictionary unavailable; searching the query as typed',
      );
      return { raw: rawQuery, brandStripped: rawQuery };
    }
  }

  /**
   * Runs the brand-stripped query through the two TecDoc tiers, then the raw
   * query only if it differs and the stripped one matched nothing (the "brand"
   * token may actually have been part of the number). When a vehicleId is
   * given, every candidate/tier is scoped to it so TecDoc returns only parts
   * that fit that vehicle (no separate fit lookup, no per-item badge). Active
   * facet `filters` are applied to every candidate/tier. The first
   * candidate/tier with a non-empty total wins; its total and facets are
   * authoritative for pagination and are stable across pages.
   */
  private async executeSearchWithFallback(
    parsed: ParsedQuery,
    vehicleId: string | undefined,
    page: number,
    pageSize: number,
    filters: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    const candidates =
      parsed.raw === parsed.brandStripped
        ? [parsed.brandStripped]
        : [parsed.brandStripped, parsed.raw];

    let lastResult: PaginatedSearchArticlesDto = {
      total: 0,
      page,
      pageSize,
      items: [],
      facets: [],
    };

    for (const candidate of candidates) {
      for (const matchType of SEARCH_TIERS) {
        const result = await this.catalog.searchArticles(
          candidate,
          vehicleId,
          matchType,
          page,
          pageSize,
          filters,
        );

        if (result.total > 0) {
          return result;
        }

        lastResult = result;
      }
    }

    return lastResult;
  }

  /** Moves results whose brand matches the stripped brand token to the front. */
  private rankByBrand(
    items: ArticleSummaryDto[],
    brandHint: string | undefined,
  ): ArticleSummaryDto[] {
    if (!brandHint) {
      return items;
    }

    const matches: ArticleSummaryDto[] = [];
    const rest: ArticleSummaryDto[] = [];
    for (const item of items) {
      (this.matchesBrandHint(item, brandHint) ? matches : rest).push(item);
    }

    return [...matches, ...rest];
  }

  private matchesBrandHint(
    item: ArticleSummaryDto,
    brandHint: string,
  ): boolean {
    const brand = item.brandName.toUpperCase();
    return brandHint
      .toUpperCase()
      .split(/\s+/)
      .some((token) => token.length > 0 && brand.includes(token));
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

    return this.catalog.getAutocompleteSuggestions(prefix);
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
