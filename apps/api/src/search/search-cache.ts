import { Injectable } from '@nestjs/common';
import { AutocompleteItemDto } from '@vp-parts-shop/shared';
import { RedisCache } from '../redis';
import { SearchExecution } from './search-types';
import { SearchRequest, SearchSetRequest } from './search-call';
import {
  SearchEnumeration,
  isSortableSet,
  withoutCandidates,
} from './search-enumeration';
import { SearchRowsPage, SearchTecDoc } from './search.tecdoc';
import {
  autocompleteArticlesCacheKey,
  autocompleteTermsCacheKey,
  searchPageCacheKey,
  searchSetCacheKey,
} from './search-cache-keys';

const SEARCH_TTL = 60 * 60;
const SEARCH_MISS_TTL = 5 * 60;
const AUTOCOMPLETE_TTL = 15 * 60;
const AUTOCOMPLETE_MISS_TTL = 5 * 60;

/**
 * The Redis layer of the search: every TecDoc read the search surfaces make goes
 * through here, so the TTLs and the cache keys live in one place rather than
 * being restated by each caller. The order a ranked set is served in is pinned
 * by `ArticleOrderCache`, shared with the other list surfaces.
 *
 * Brand logos are joined per request by the caller rather than cached with the
 * payloads, so a logo change never needs a search-cache bust.
 */
@Injectable()
export class SearchCache {
  constructor(
    private readonly searchTecDoc: SearchTecDoc,
    private readonly cache: RedisCache,
  ) {}

  /**
   * Cached (1h hit / 5m empty-miss) enumeration of a whole match set.
   *
   * A set too wide to order is stored without its candidates: they were read
   * because TecDoc will not count a set without naming articles from it, and
   * nothing downstream reads them, so pinning several hundred kilobytes of them
   * would be the one avoidable cost on this path. What is left is the entry the
   * fallback path needs — the total, the facets and the navigation — which is
   * also what makes a second request for a wide search skip the enumeration's
   * TecDoc call entirely.
   */
  enumerate(request: SearchSetRequest): Promise<SearchEnumeration> {
    return this.cache.cached(
      searchSetCacheKey(request),
      SEARCH_TTL,
      () => this.readEnumeration(request),
      // A set with no matches is worth forgetting sooner: TecDoc data changes
      // under us, and a hopeless query should not be pinned for the full hour.
      { missTtl: SEARCH_MISS_TTL, isEmpty: (value) => value.total === 0 },
    );
  }

  /** Cached (1h hit / 5m empty-miss) page of rows in TecDoc's native order. */
  readRowsPage(request: SearchRequest): Promise<SearchRowsPage> {
    return this.cache.cached(
      searchPageCacheKey(request),
      SEARCH_TTL,
      () =>
        this.searchTecDoc.readRowsPage(
          request.query,
          request.vehicleId,
          request.execution,
          request.page,
          request.pageSize,
          request.filters,
        ),
      {
        missTtl: SEARCH_MISS_TTL,
        isEmpty: (value) => value.items.length === 0,
      },
    );
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

  private async readEnumeration(
    request: SearchSetRequest,
  ): Promise<SearchEnumeration> {
    const enumeration = await this.searchTecDoc.enumerate(
      request.query,
      request.vehicleId,
      request.execution,
      request.filters,
    );

    return isSortableSet(enumeration.total)
      ? enumeration
      : withoutCandidates(enumeration);
  }
}
