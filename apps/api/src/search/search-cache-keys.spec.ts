import {
  autocompleteArticlesCacheKey,
  autocompleteTermsCacheKey,
  laneCacheKey,
  laneToken,
  normaliseCacheQuery,
  searchCacheKey,
} from './search-cache-keys';
import { SearchRequest } from './search-plan';
import { SearchFilters, TecDocSearchType } from './search-types';

const PART = { type: TecDocSearchType.AnyNumber, matchType: 'prefix' } as const;
const TERM = { type: TecDocSearchType.FreeText } as const;

function request(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    query: 'WL6340',
    execution: PART,
    page: 1,
    pageSize: 20,
    filters: {},
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

describe('searchCacheKey', () => {
  it('is stable for an identical request', () => {
    expect(searchCacheKey(request())).toBe(searchCacheKey(request()));
  });

  it('ignores the case a number query was typed in', () => {
    expect(searchCacheKey(request({ query: 'wl6340' }))).toBe(
      searchCacheKey(request({ query: 'WL6340' })),
    );
  });

  // Two callers who picked the same brands in a different order are asking the
  // same question, so they must not each pay for a TecDoc call.
  it('ignores the order brand ids were selected in', () => {
    expect(searchCacheKey(request({ filters: { brandIds: [30, 4] } }))).toBe(
      searchCacheKey(request({ filters: { brandIds: [4, 30] } })),
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

    expect(searchCacheKey(request({ filters: first }))).toBe(
      searchCacheKey(request({ filters: second })),
    );
  });

  // The hint only matters through the decision it drives, so hints that resolve
  // the same way must share an entry.
  it('folds a categoryHasChildren hint into the request it produces', () => {
    const absent = request({ filters: { categoryNodeId: 5 } });
    const hasChildren = request({
      filters: { categoryNodeId: 5, categoryHasChildren: true },
    });
    const isLeaf = request({
      filters: { categoryNodeId: 5, categoryHasChildren: false },
    });

    expect(searchCacheKey(absent)).toBe(searchCacheKey(hasChildren));
    expect(searchCacheKey(isLeaf)).not.toBe(searchCacheKey(absent));
  });

  it.each([
    ['page', request({ page: 2 })],
    ['page size', request({ pageSize: 50 })],
    ['vehicle scope', request({ vehicleId: 10042 })],
    ['execution', request({ execution: TERM })],
    ['query', request({ query: 'WL6341' })],
    ['brand selection', request({ filters: { brandIds: [4] } })],
    ['category selection', request({ filters: { categoryNodeId: 5 } })],
  ])('separates entries that differ by %s', (_label, variant) => {
    expect(searchCacheKey(variant)).not.toBe(searchCacheKey(request()));
  });
});

describe('laneCacheKey', () => {
  const plan = [
    { query: 'WA5432', execution: PART },
    { query: 'WA5432 WIX', execution: PART },
  ];

  it('is stable for the same plan and vehicle scope', () => {
    expect(laneCacheKey(plan, undefined)).toBe(laneCacheKey(plan, undefined));
  });

  // A lane is a property of the query, so one memo serves every refinement and
  // every page — the key never sees filters or paging at all.
  it('ignores the case the plan queries were typed in', () => {
    const lowercased = [
      { query: 'wa5432', execution: PART },
      { query: 'wa5432 wix', execution: PART },
    ];

    expect(laneCacheKey(lowercased, undefined)).toBe(
      laneCacheKey(plan, undefined),
    );
  });

  it('separates the vehicle-scoped memo from the unscoped one', () => {
    expect(laneCacheKey(plan, 10042)).not.toBe(laneCacheKey(plan, undefined));
  });

  it('separates plans whose steps are ordered differently', () => {
    expect(laneCacheKey([...plan].reverse(), undefined)).not.toBe(
      laneCacheKey(plan, undefined),
    );
  });
});

describe('laneToken', () => {
  it('normalises the step query the same way the search key does', () => {
    expect(laneToken({ query: '  wa5432 ', execution: PART })).toBe('WA5432');
  });

  it('lowercases a free-text step', () => {
    expect(laneToken({ query: 'Oil Filter', execution: TERM })).toBe(
      'oil filter',
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
