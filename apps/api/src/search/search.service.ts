import { Injectable, Logger } from '@nestjs/common';
import {
  ArticleAutocompleteItemDto,
  CategoryNavigationDto,
  SearchResponseDto,
} from '@vp-parts-shop/shared';
import { BrandsService } from '../catalog/brands';
import {
  DEFAULT_SEARCH_MODE,
  SearchFilters,
  SearchMode,
  isFacetPage,
} from './search-types';
import { searchCallFor, setRequestFor } from './search-call';
import { SearchCache } from './search-cache';
import { SearchResults } from './search-results';
import { AutocompleteService } from './autocomplete.service';
import { buildBrandTokenSet } from './brand-dictionary';
import { parseQuery, ParsedQuery } from './query-parser';
import { SEARCH_DEFAULT_PAGE, SEARCH_DEFAULT_PAGE_SIZE } from './search.dto';

/**
 * Orchestrates a search: parse the query, resolve the TecDoc call that answers
 * it, enumerate the whole match set, read the page in whichever order that set
 * allows, and assemble the response. The TecDoc calls, their caching, the
 * ordering and the suggestion surfaces each live behind their own collaborator
 * so this reads as the sequence of steps and nothing else.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly cache: SearchCache,
    private readonly results: SearchResults,
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
    const call = searchCallFor(parsed, searchMode);
    const scope = { vehicleId, page, pageSize, filters };

    const enumeration = await this.cache.enumerate(setRequestFor(call, scope));
    const result = await this.results.read(enumeration, call, scope);

    if (enumeration.total === 0) {
      this.logZeroResult(rawQuery, parsed.brandStripped, vehicleId);
    }

    const [{ items, facets }, suggestions] = await Promise.all([
      this.brands.attachSearchLogos({
        items: result.items,
        facets: enumeration.facets,
      }),
      this.suggestionsFor(enumeration.total, rawQuery),
    ]);

    return {
      query,
      results: items,
      // The narrowed count, from the read: a stock filter removes matches from
      // the set being paged, and a pager sized on the enumeration would offer
      // pages that no longer exist. How wide the set is without it travels
      // separately, as the counts.
      total: result.total,
      page,
      pageSize,
      maxPage: result.maxPage,
      ordering: result.ordering,
      ...(result.stockScopeCounts && {
        stockScopeCounts: result.stockScopeCounts,
      }),
      ...(facets.length > 0 && { facets }),
      // The attribute block describes the whole match set, so every later page
      // would repeat page 1's verbatim; the client keeps the one it was given
      // while paginating.
      ...(isFacetPage(page) &&
        enumeration.attributes.length > 0 && {
          attributes: enumeration.attributes,
        }),
      ...(this.hasCategoryNavigation(enumeration.categoryNavigation) && {
        categoryNavigation: enumeration.categoryNavigation,
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
   * Alternatives for a query that found nothing — taken from the enumeration's
   * total, never the narrowed one. A search emptied by its own stock filter
   * matched perfectly well, and offering to correct the spelling of a query that
   * worked sends the visitor away from the one click that would fix it.
   */
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
