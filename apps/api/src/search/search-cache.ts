import { Injectable } from '@nestjs/common';
import {
  AutocompleteItemDto,
  PaginatedSearchArticlesDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../redis';
import { BrandsService } from '../catalog/brands';
import { SearchExecution } from './search-types';
import { SearchRequest } from './search-plan';
import { SearchTecDoc } from './search.tecdoc';
import {
  autocompleteArticlesCacheKey,
  autocompleteTermsCacheKey,
  searchCacheKey,
} from './search-cache-keys';

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
 * The Redis-cached view of {@link SearchTecDoc}. Every TecDoc read the search
 * surfaces make goes through here, so the TTLs and the cache keys live in one
 * place rather than being restated by each caller.
 */
@Injectable()
export class SearchCache {
  constructor(
    private readonly searchTecDoc: SearchTecDoc,
    private readonly brands: BrandsService,
    private readonly cache: RedisCache,
  ) {}

  /**
   * Cached (1h hit / 5m empty-miss) TecDoc search, with brand logos joined onto
   * the article rows and brand facet from the same cached brand read. The
   * cached payload is the raw TecDoc result (no logos); the logo join is
   * applied per request so a brand-logo change never needs a search-cache bust.
   */
  async searchArticles(
    request: SearchRequest,
  ): Promise<PaginatedSearchArticlesDto> {
    const raw = await this.cache.cachedPaginated(
      searchCacheKey(request),
      SEARCH_TTL,
      SEARCH_MISS_TTL,
      () =>
        this.searchTecDoc.searchArticles(
          request.query,
          request.vehicleId,
          request.execution,
          request.page,
          request.pageSize,
          request.filters,
        ),
    );

    return this.brands.applyLogosToSearchResults(raw);
  }

  autocompleteArticles(
    query: string,
    execution: SearchExecution,
  ): Promise<AutocompleteItemDto[]> {
    return this.cache.cachedArray(
      autocompleteArticlesCacheKey(query, execution),
      AUTOCOMPLETE_TTL,
      AUTOCOMPLETE_MISS_TTL,
      () => this.searchTecDoc.getAutocompleteArticles(query, execution),
    );
  }

  autocompleteTerms(query: string): Promise<AutocompleteItemDto[]> {
    return this.cache.cachedArray(
      autocompleteTermsCacheKey(query),
      AUTOCOMPLETE_TTL,
      AUTOCOMPLETE_MISS_TTL,
      () => this.searchTecDoc.getAutocompleteTerms(query),
    );
  }

  readLane(key: string): Promise<string | undefined> {
    return this.cache.readMemo<string>(key);
  }

  writeLane(key: string, token: string): Promise<void> {
    return this.cache.writeMemo(key, token, SEARCH_LANE_TTL);
  }
}
