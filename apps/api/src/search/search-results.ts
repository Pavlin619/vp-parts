import { Injectable } from '@nestjs/common';
import { ArticleSummaryDto, SearchOrdering } from '@vp-parts-shop/shared';
import {
  ArticleOrderCache,
  ArticleRowsCache,
  pageOf,
} from '../catalog/articles/article-list';
import {
  SearchCall,
  SearchScope,
  requestFor,
  setRequestFor,
} from './search-call';
import {
  SearchEnumeration,
  isSortableSet,
  resolveMaxPage,
} from './search-enumeration';
import { SearchCache } from './search-cache';
import { searchOrderCacheKey } from './search-cache-keys';

/** The rows one page of a search renders, and the order they are in. */
export interface SearchResultPage {
  items: ArticleSummaryDto[];
  maxPage: number;
  ordering: SearchOrdering;
}

/**
 * Reads the page a visitor asked for out of an enumerated match set.
 *
 * Which order they get depends on the size of the set, and only on that. A set
 * that fits in one enumeration is ranked by what we can actually ship, then cut
 * into pages here — the ranking has to see every match, so it is the whole set
 * or nothing. A wider set is served in TecDoc's own order from a page read,
 * because ranking a truncated set would put "in stock" at the top of an
 * arbitrary thousand of a million matches, which is worse than not ranking at
 * all: it would read as a promise about the whole result.
 */
@Injectable()
export class SearchResults {
  constructor(
    private readonly cache: SearchCache,
    private readonly order: ArticleOrderCache,
    private readonly rows: ArticleRowsCache,
  ) {}

  read(
    enumeration: SearchEnumeration,
    call: SearchCall,
    scope: SearchScope,
  ): Promise<SearchResultPage> {
    return isSortableSet(enumeration.total)
      ? this.readOrderedPage(enumeration, call, scope)
      : this.readCataloguePage(enumeration, call, scope);
  }

  /**
   * One page of the set, cut out of its ranking by what we can ship.
   *
   * The ranking is pinned under a page-free key, so every page of one search is
   * cut from the same order — see {@link ArticleOrderCache} for why that matters
   * and how long it holds.
   */
  private async readOrderedPage(
    enumeration: SearchEnumeration,
    call: SearchCall,
    scope: SearchScope,
  ): Promise<SearchResultPage> {
    const ordered = await this.order.ordered(
      searchOrderCacheKey(setRequestFor(call, scope)),
      enumeration.candidates,
    );

    const requested = pageOf(ordered, scope.page, scope.pageSize);

    return {
      items: await this.rows.hydrate(requested.items),
      maxPage: resolveMaxPage(enumeration.total, scope.pageSize),
      ordering: 'availability',
    };
  }

  /**
   * One page of a set too wide to order, as TecDoc returns it.
   *
   * `maxPage` comes from this read rather than from the total, because TecDoc
   * serves only the first ~10,000 results of a match set: a query reporting
   * millions of matches will refuse a page the count says exists.
   */
  private async readCataloguePage(
    enumeration: SearchEnumeration,
    call: SearchCall,
    scope: SearchScope,
  ): Promise<SearchResultPage> {
    const page = await this.cache.readRowsPage(requestFor(call, scope));

    return {
      items: page.items,
      maxPage: resolveMaxPage(
        enumeration.total,
        scope.pageSize,
        page.maxAllowedPage,
      ),
      ordering: 'catalogue',
    };
  }
}
