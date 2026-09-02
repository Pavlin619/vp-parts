import { SearchSort } from '@vp-parts-shop/shared';
import {
  autocompleteArticlesCacheKey,
  autocompleteTermsCacheKey,
  normaliseCacheQuery,
  searchOrderCacheKey,
  searchPageCacheKey,
  searchSetCacheKey,
} from './search-cache-keys';
import { SearchRequest, SearchSetRequest } from './search-call';
import { SearchFilters, TecDocSearchType } from './search-types';

const PART = { type: TecDocSearchType.AnyNumber, matchType: 'prefix' } as const;
const TERM = { type: TecDocSearchType.FreeText } as const;

function setRequest(
  overrides: Partial<SearchSetRequest> = {},
): SearchSetRequest {
  return {
    query: 'WL6340',
    execution: PART,
    sort: SearchSort.Availability,
    filters: {},
    ...overrides,
  };
}

function request(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    ...setRequest(),
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

describe('normaliseCacheQuery', () => {
  it('uppercases a number query so the same part number shares one entry', () => {
    expect(normaliseCacheQuery('  wl-6340 ', TecDocSearchType.AnyNumber)).toBe(
      'WL-6340',
    );
  });

  it('lowercases a free-text query', () => {
    expect(
      normaliseCacheQuery('  Oil Filter ', TecDocSearchType.FreeText),
    ).toBe('oil filter');
  });
});

describe('searchSetCacheKey', () => {
  it('is stable for an identical request', () => {
    expect(searchSetCacheKey(setRequest())).toBe(
      searchSetCacheKey(setRequest()),
    );
  });

  it('ignores the case a number query was typed in', () => {
    expect(searchSetCacheKey(setRequest({ query: 'wl6340' }))).toBe(
      searchSetCacheKey(setRequest({ query: 'WL6340' })),
    );
  });

  // Two callers who picked the same brands in a different order are asking the
  // same question, so they must not each pay for a TecDoc call.
  it('ignores the order brand ids were selected in', () => {
    expect(
      searchSetCacheKey(setRequest({ filters: { brandIds: [30, 4] } })),
    ).toBe(searchSetCacheKey(setRequest({ filters: { brandIds: [4, 30] } })));
  });

  it('ignores the order product type ids were selected in', () => {
    expect(
      searchSetCacheKey(setRequest({ filters: { productTypeIds: [30, 4] } })),
    ).toBe(
      searchSetCacheKey(setRequest({ filters: { productTypeIds: [4, 30] } })),
    );
  });

  // TecDoc knows nothing about what we can ship, so a stock narrowing changes
  // no article it matches. Keyed on it, one search would pay for a TecDoc call
  // per state of a control that never reaches TecDoc.
  it('ignores a stock narrowing, which TecDoc never sees', () => {
    expect(
      searchSetCacheKey(setRequest({ filters: { stockScope: 'central' } })),
    ).toBe(searchSetCacheKey(setRequest()));
  });

  // The same articles match whichever order they are read in. Keyed on the sort,
  // switching it would re-fetch a set of up to a thousand candidates to hand
  // back the rows already in hand.
  it('ignores the order asked for, which matches the same articles', () => {
    expect(
      searchSetCacheKey(setRequest({ sort: SearchSort.PriceAscending })),
    ).toBe(searchSetCacheKey(setRequest()));
  });

  it('separates two searches narrowed to different product types', () => {
    expect(
      searchSetCacheKey(setRequest({ filters: { productTypeIds: [7] } })),
    ).not.toBe(
      searchSetCacheKey(setRequest({ filters: { productTypeIds: [9] } })),
    );
  });

  it('ignores the order criteria selections were made in', () => {
    const first: SearchFilters = {
      criteria: [
        { criteriaId: 44, rawValue: 'front' },
        { criteriaId: 20, rawValue: '106.4' },
      ],
    };
    const second: SearchFilters = {
      criteria: [
        { criteriaId: 20, rawValue: '106.4' },
        { criteriaId: 44, rawValue: 'front' },
      ],
    };

    expect(searchSetCacheKey(setRequest({ filters: first }))).toBe(
      searchSetCacheKey(setRequest({ filters: second })),
    );
  });

  // The hint only matters through the decision it drives, so hints that resolve
  // the same way must share an entry.
  it('folds a categoryHasChildren hint into the request it produces', () => {
    const absent = setRequest({ filters: { categoryNodeId: 5 } });
    const hasChildren = setRequest({
      filters: { categoryNodeId: 5, categoryHasChildren: true },
    });
    const isLeaf = setRequest({
      filters: { categoryNodeId: 5, categoryHasChildren: false },
    });

    expect(searchSetCacheKey(absent)).toBe(searchSetCacheKey(hasChildren));
    expect(searchSetCacheKey(isLeaf)).not.toBe(searchSetCacheKey(absent));
  });

  it.each([
    ['vehicle scope', setRequest({ vehicleId: 10042 })],
    ['execution', setRequest({ execution: TERM })],
    ['query', setRequest({ query: 'WL6341' })],
    ['brand selection', setRequest({ filters: { brandIds: [4] } })],
    ['category selection', setRequest({ filters: { categoryNodeId: 5 } })],
  ])('separates entries that differ by %s', (_label, variant) => {
    expect(searchSetCacheKey(variant)).not.toBe(
      searchSetCacheKey(setRequest()),
    );
  });
});

describe('searchPageCacheKey', () => {
  it('is stable for an identical request', () => {
    expect(searchPageCacheKey(request())).toBe(searchPageCacheKey(request()));
  });

  it('narrows a page exactly as the set it slices was narrowed', () => {
    expect(
      searchPageCacheKey(request({ filters: { brandIds: [30, 4] } })),
    ).toBe(searchPageCacheKey(request({ filters: { brandIds: [4, 30] } })));
  });

  it.each([
    ['page', request({ page: 2 })],
    ['page size', request({ pageSize: 50 })],
    ['query', request({ query: 'WL6341' })],
    ['vehicle scope', request({ vehicleId: 10042 })],
    // TecDoc does this sorting inside the page read, so two sorts really are
    // two different pages of rows.
    ['sort', request({ sort: SearchSort.Brand })],
  ])('separates entries that differ by %s', (_label, variant) => {
    expect(searchPageCacheKey(variant)).not.toBe(searchPageCacheKey(request()));
  });

  // The two reads answer different questions about the same match set, so a
  // page must never be served an enumeration or the other way round.
  it('never collides with the enumeration of the same set', () => {
    expect(searchPageCacheKey(request())).not.toBe(
      searchSetCacheKey(setRequest()),
    );
  });
});

describe('searchOrderCacheKey', () => {
  it('is stable for an identical request', () => {
    expect(searchOrderCacheKey(setRequest())).toBe(
      searchOrderCacheKey(setRequest()),
    );
  });

  it('narrows an order exactly as the set it ranks was narrowed', () => {
    expect(
      searchOrderCacheKey(setRequest({ filters: { brandIds: [30, 4] } })),
    ).toBe(searchOrderCacheKey(setRequest({ filters: { brandIds: [4, 30] } })));
  });

  it.each([
    ['query', setRequest({ query: 'WL6341' })],
    ['vehicle scope', setRequest({ vehicleId: 10042 })],
    ['brand selection', setRequest({ filters: { brandIds: [4] } })],
  ])('separates entries that differ by %s', (_label, variant) => {
    expect(searchOrderCacheKey(variant)).not.toBe(
      searchOrderCacheKey(setRequest()),
    );
  });

  /**
   * The one key the sort belongs in. Sharing an entry across sorts would page on
   * through the pinned copy of the previous ranking — switching the control and
   * watching the list not move, with nothing logged and nothing thrown.
   */
  it('pins one ranking per order asked for', () => {
    const keys = [
      SearchSort.Availability,
      SearchSort.PriceAscending,
      SearchSort.PriceDescending,
      SearchSort.Brand,
      SearchSort.ArticleNumber,
      SearchSort.Catalogue,
    ].map((sort) => searchOrderCacheKey(setRequest({ sort })));

    expect(new Set(keys).size).toBe(keys.length);
  });

  // The order covers the whole set, so the slice taken out of it is not part of
  // its identity — that is what lets page 2 be cut from the ranking page 1 saw.
  it('is page-free', () => {
    expect(searchOrderCacheKey(setRequest())).not.toContain('page');
    expect(searchOrderCacheKey(request({ page: 2, pageSize: 50 }))).toBe(
      searchOrderCacheKey(setRequest()),
    );
  });

  // A stock narrowing is cut out of the ranking rather than ranked separately,
  // so all three of its states share one order. Keyed on it, switching the
  // control would re-rank the list the visitor is standing in.
  it('is free of the stock narrowing cut out of it', () => {
    expect(
      searchOrderCacheKey(setRequest({ filters: { stockScope: 'central' } })),
    ).toBe(searchOrderCacheKey(setRequest()));
  });

  it('never collides with the enumeration of the same set', () => {
    expect(searchOrderCacheKey(setRequest())).not.toBe(
      searchSetCacheKey(setRequest()),
    );
  });
});

describe('autocomplete cache keys', () => {
  it('carries the match strategy so prefix and exact never collide', () => {
    const prefix = autocompleteArticlesCacheKey('WL634', PART);
    const exact = autocompleteArticlesCacheKey('WL634', {
      type: TecDocSearchType.AnyNumber,
      matchType: 'exact',
    });

    expect(prefix).toBe('tecdoc:autocomplete:article:prefix:WL634');
    expect(exact).not.toBe(prefix);
  });

  it('falls back to "any" when the execution has no match strategy', () => {
    expect(autocompleteArticlesCacheKey('WL634', TERM)).toBe(
      'tecdoc:autocomplete:article:any:wl634',
    );
  });

  it('keys term suggestions under the lowercased query', () => {
    expect(autocompleteTermsCacheKey('  Oil Filter ')).toBe(
      'tecdoc:autocomplete:term:oil filter',
    );
  });

  it('keeps article and term suggestions in separate namespaces', () => {
    expect(autocompleteArticlesCacheKey('WL634', PART)).not.toBe(
      autocompleteTermsCacheKey('WL634'),
    );
  });
});
