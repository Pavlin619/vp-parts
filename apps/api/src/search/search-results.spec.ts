import {
  ArticleInventoryDetailDto,
  ArticleSummaryDto,
  SearchSort,
  articleIdentityKey,
} from '@vp-parts-shop/shared';
import { SearchResults } from './search-results';
import { SearchCache } from './search-cache';
import { SEARCH_SORTABLE_LIMIT, SearchEnumeration } from './search-enumeration';
import { SearchCall, SearchScope } from './search-call';
import { TecDocSearchType } from './search-types';
import {
  ArticleOrderCache,
  ArticleRowsCache,
} from '../catalog/articles/article-list';
import { RedisCache } from '../redis';
import { InventoryService } from '../inventory';
import { ArticleCandidate, ArticleStatus } from '../tecdoc';

const readRowsPageMock = jest.fn();
const readMemoMock = jest.fn();
const writeMemoMock = jest.fn();
const availabilityMock = jest.fn();
const hydrateMock = jest.fn();

const mockCache = {
  readRowsPage: readRowsPageMock,
} as unknown as SearchCache;

// The order cache is the real one over a mocked Redis: what its rules are is
// settled in article-order.cache.spec.ts, and what matters here is that a page
// is cut from the order it pinned.
const mockRedis = {
  readMemo: readMemoMock,
  writeMemo: writeMemoMock,
} as unknown as RedisCache;

const mockInventory = {
  getAvailabilityForOrdering: availabilityMock,
} as unknown as InventoryService;

const mockRows = { hydrate: hydrateMock } as unknown as ArticleRowsCache;

const ORDER_KEY = expect.stringMatching(/^search:order:[a-f0-9]{64}$/);

const WIX = '268';
const CALL: SearchCall = {
  query: 'WL634',
  execution: {
    type: TecDocSearchType.AnyNumber,
    matchType: 'prefix_or_suffix',
  },
};

function scope(overrides: Partial<SearchScope> = {}): SearchScope {
  return {
    page: 1,
    pageSize: 20,
    sort: SearchSort.Availability,
    filters: {},
    ...overrides,
  };
}

function candidate(
  articleNumber: string,
  overrides: Partial<ArticleCandidate> = {},
): ArticleCandidate {
  return {
    brandId: WIX,
    brandName: 'WIX',
    articleNumber,
    description: 'Oil Filter',
    legacyArticleIds: [1],
    articleStatusId: ArticleStatus.Normal,
    ...overrides,
  };
}

function enumeration(
  candidates: ArticleCandidate[],
  overrides: Partial<SearchEnumeration> = {},
): SearchEnumeration {
  return {
    total: candidates.length,
    candidates,
    facets: [],
    attributes: [],
    categoryNavigation: { current: null, ancestors: [], options: [] },
    ...overrides,
  };
}

function candidates(count: number): ArticleCandidate[] {
  return Array.from({ length: count }, (_unused, index) =>
    candidate(`WL${6000 + index}`),
  );
}

function row(articleNumber: string): ArticleSummaryDto {
  return {
    articleNumber,
    brandId: WIX,
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: null,
    technicalSpecs: [],
    fitsVehicle: null,
  };
}

const IN_STOCK: ArticleInventoryDetailDto = {
  available: true,
  bestPriceExVat: 35,
  bestPriceIncVat: 42,
  availabilityByWarehouse: [
    {
      warehouseId: 'CENTRAL',
      quantity: 2,
      deliveryWorkDays: 0,
      orderCutoffTime: '17:00',
      cutoffAt: '2026-08-23T14:00:00.000Z',
      pickup: { earliestAt: '2026-08-23T15:00:00.000Z', granularity: 'HOUR' },
      courier: { earliestAt: '2026-08-24T06:00:00.000Z', granularity: 'DAY' },
    },
  ],
  computedAt: '2026-08-23T12:00:00.000Z',
};

function stocked(
  articleNumber: string,
): Map<string, ArticleInventoryDetailDto> {
  return new Map([[articleIdentityKey(WIX, articleNumber), IN_STOCK]]);
}

describe('SearchResults', () => {
  let results: SearchResults;

  beforeEach(() => {
    jest.resetAllMocks();
    availabilityMock.mockResolvedValue(null);
    readMemoMock.mockResolvedValue(undefined);
    hydrateMock.mockImplementation((requested: ArticleCandidate[]) =>
      Promise.resolve(requested.map((entry) => row(entry.articleNumber))),
    );

    results = new SearchResults(
      mockCache,
      new ArticleOrderCache(mockRedis, mockInventory),
      mockRows,
    );
  });

  describe('a set narrow enough to rank', () => {
    it('orders by what we can ship and says so', async () => {
      availabilityMock.mockResolvedValue(stocked('B-STOCKED'));

      const page = await results.read(
        enumeration([candidate('A-NO-STOCK'), candidate('B-STOCKED')]),
        CALL,
        scope(),
      );

      expect(page.items.map((item) => item.articleNumber)).toEqual([
        'B-STOCKED',
        'A-NO-STOCK',
      ]);
      expect(page.ordering).toBe('availability');
      expect(page.isRankable).toBe(true);
    });

    it('ranks the set in the order it was asked for', async () => {
      availabilityMock.mockResolvedValue(
        new Map([
          ...stocked('DEAR'),
          [
            articleIdentityKey(WIX, 'CHEAP'),
            { ...IN_STOCK, bestPriceIncVat: 9 },
          ],
        ]),
      );

      const page = await results.read(
        enumeration([candidate('DEAR'), candidate('CHEAP')]),
        CALL,
        scope({ sort: SearchSort.PriceAscending }),
      );

      expect(page.items.map((item) => item.articleNumber)).toEqual([
        'CHEAP',
        'DEAR',
      ]);
      expect(page.ordering).toBe(SearchSort.PriceAscending);
    });

    /**
     * The two sorts TecDoc could answer itself are still answered from our own
     * ranking here, because we already hold the set — and a second source for
     * the same order is a second answer to it.
     */
    it('answers a catalogue axis from the set it holds', async () => {
      const page = await results.read(
        enumeration([
          candidate('Z1', { brandName: 'ZF' }),
          candidate('A1', { brandName: 'ATE' }),
        ]),
        CALL,
        scope({ sort: SearchSort.Brand }),
      );

      expect(page.items.map((item) => item.articleNumber)).toEqual([
        'A1',
        'Z1',
      ]);
      expect(page.ordering).toBe(SearchSort.Brand);
      expect(readRowsPageMock).not.toHaveBeenCalled();
    });

    /**
     * Two sorts of one search must not share a pinned ranking — served the other
     * one's order, the list would simply not move when the control changed.
     */
    it('pins each order under its own key', async () => {
      availabilityMock.mockResolvedValue(stocked('A1'));
      const set = enumeration([candidate('A1'), candidate('A2')]);

      await results.read(set, CALL, scope({ sort: SearchSort.Availability }));
      await results.read(
        set,
        CALL,
        scope({ sort: SearchSort.PriceDescending }),
      );

      const [firstKey] = writeMemoMock.mock.calls[0];
      const [secondKey] = writeMemoMock.mock.calls[1];

      expect(firstKey).not.toBe(secondKey);
    });

    // The ranking is only meaningful if it saw every match, which is the whole
    // reason a set is read whole rather than a page at a time.
    it('reads stock for the whole set, not the page it serves', async () => {
      await results.read(enumeration(candidates(30)), CALL, scope());

      expect(availabilityMock.mock.calls[0][0]).toHaveLength(30);
      expect(availabilityMock).toHaveBeenCalledWith(
        expect.arrayContaining([{ brandId: WIX, articleNumber: 'WL6029' }]),
      );
    });

    // A hydrated row costs roughly ten times a candidate, so only the page a
    // visitor reached is paid for.
    it('hydrates the requested page alone', async () => {
      const page = await results.read(
        enumeration(candidates(30)),
        CALL,
        scope({ page: 2, pageSize: 20 }),
      );

      expect(hydrateMock.mock.calls[0][0]).toHaveLength(10);
      expect(page.items.map((item) => item.articleNumber)).toEqual(
        candidates(30)
          .slice(20)
          .map((entry) => entry.articleNumber),
      );
    });

    // We hold the whole set, so every page of it is reachable and TecDoc's own
    // ceiling never applies.
    it('counts every page of the set', async () => {
      const page = await results.read(
        enumeration(candidates(45)),
        CALL,
        scope({ pageSize: 20 }),
      );

      expect(page.maxPage).toBe(3);
      expect(readRowsPageMock).not.toHaveBeenCalled();
    });

    it('serves an empty set without reading a page of rows', async () => {
      const page = await results.read(enumeration([]), CALL, scope());

      expect(page.items).toEqual([]);
      expect(page.maxPage).toBe(0);
      expect(readRowsPageMock).not.toHaveBeenCalled();
    });

    // The stock read fails soft: an outage must cost the list its order, never
    // its existence.
    it('still serves the page when stock cannot be read', async () => {
      availabilityMock.mockResolvedValue(null);

      const page = await results.read(
        enumeration([candidate('WL6341'), candidate('WL6340')]),
        CALL,
        scope(),
      );

      expect(page.items.map((item) => item.articleNumber)).toEqual([
        'WL6340',
        'WL6341',
      ]);
      expect(page.ordering).toBe('availability');
    });
  });

  describe('narrowing a ranked set by stock origin', () => {
    it('counts what each origin holds across the whole set', async () => {
      availabilityMock.mockResolvedValue(stocked('B-STOCKED'));

      const page = await results.read(
        enumeration([candidate('A-NO-STOCK'), candidate('B-STOCKED')]),
        CALL,
        scope(),
      );

      expect(page.stockScopeCounts).toEqual({
        all: 2,
        central: 1,
        external: 0,
      });
    });

    it('serves only what the requested origin holds', async () => {
      availabilityMock.mockResolvedValue(stocked('B-STOCKED'));

      const page = await results.read(
        enumeration([candidate('A-NO-STOCK'), candidate('B-STOCKED')]),
        CALL,
        scope({ filters: { stockScope: 'central' } }),
      );

      expect(page.items.map((item) => item.articleNumber)).toEqual([
        'B-STOCKED',
      ]);
    });

    // The pager has to measure what is actually being paged through, or it
    // offers pages that were narrowed away.
    it('sizes the total and the pager from the narrowed set', async () => {
      availabilityMock.mockResolvedValue(stocked('B-STOCKED'));

      const page = await results.read(
        enumeration(candidates(45).concat(candidate('B-STOCKED'))),
        CALL,
        scope({ pageSize: 20, filters: { stockScope: 'central' } }),
      );

      expect(page.total).toBe(1);
      expect(page.maxPage).toBe(1);
    });

    // The counts label the control that applied the narrowing, so they describe
    // the set as it would be without it.
    it('counts the set before the narrowing it reports', async () => {
      availabilityMock.mockResolvedValue(stocked('B-STOCKED'));

      const page = await results.read(
        enumeration([candidate('A-NO-STOCK'), candidate('B-STOCKED')]),
        CALL,
        scope({ filters: { stockScope: 'central' } }),
      );

      expect(page.stockScopeCounts).toEqual({
        all: 2,
        central: 1,
        external: 0,
      });
    });

    it('serves the set unnarrowed and uncounted when stock cannot be read', async () => {
      availabilityMock.mockResolvedValue(null);

      const page = await results.read(
        enumeration([candidate('WL6340'), candidate('WL6341')]),
        CALL,
        scope({ filters: { stockScope: 'central' } }),
      );

      expect(page.items).toHaveLength(2);
      expect(page.stockScopeCounts).toBeNull();
    });
  });

  // Ranking is live, so two page turns a minute apart would be ranked against
  // two different stock reads — and a part whose last unit sold in between
  // would move down a place, appearing twice or not at all. The order is
  // therefore pinned for the length of a paging session.
  describe('the pinned order', () => {
    it('pins the ranking under a key that carries no page', async () => {
      availabilityMock.mockResolvedValue(stocked('B-STOCKED'));

      await results.read(
        enumeration([
          candidate('A-NO-STOCK', { legacyArticleIds: [11] }),
          candidate('B-STOCKED', { legacyArticleIds: [22] }),
        ]),
        CALL,
        scope({ page: 2, pageSize: 1 }),
      );

      expect(writeMemoMock).toHaveBeenCalledWith(
        ORDER_KEY,
        [
          expect.objectContaining({ articleNumber: 'B-STOCKED' }),
          expect.objectContaining({ articleNumber: 'A-NO-STOCK' }),
        ],
        expect.any(Number),
      );
    });

    it('cuts a later page out of the pinned order, ranking nothing again', async () => {
      readMemoMock.mockResolvedValue([
        { brandId: WIX, articleNumber: 'PINNED-2', legacyArticleIds: [2] },
        { brandId: WIX, articleNumber: 'PINNED-1', legacyArticleIds: [1] },
      ]);

      const page = await results.read(
        enumeration([candidate('PINNED-1'), candidate('PINNED-2')]),
        CALL,
        scope({ page: 2, pageSize: 1 }),
      );

      expect(page.items.map((item) => item.articleNumber)).toEqual([
        'PINNED-1',
      ]);
      expect(writeMemoMock).not.toHaveBeenCalled();
    });

    // Two searches narrowed differently are two sets, so each is ranked and
    // pinned on its own.
    it('pins a narrowed search apart from the unnarrowed one', async () => {
      availabilityMock.mockResolvedValue(stocked('WL6340'));

      await results.read(enumeration([candidate('WL6340')]), CALL, scope());
      await results.read(
        enumeration([candidate('WL6340')]),
        CALL,
        scope({ filters: { brandIds: [4] } }),
      );

      const [unnarrowed, narrowed] = writeMemoMock.mock.calls;
      expect(unnarrowed[0]).not.toBe(narrowed[0]);
    });

    it('leaves the wide tier unpinned, having ranked nothing', async () => {
      readRowsPageMock.mockResolvedValue({ items: [], maxAllowedPage: 1 });

      await results.read(
        enumeration([], { total: SEARCH_SORTABLE_LIMIT + 1 }),
        CALL,
        scope(),
      );

      expect(readMemoMock).not.toHaveBeenCalled();
      expect(writeMemoMock).not.toHaveBeenCalled();
    });
  });

  describe('a set too wide to rank', () => {
    const WIDE_TOTAL = SEARCH_SORTABLE_LIMIT + 1;

    beforeEach(() => {
      readRowsPageMock.mockResolvedValue({
        items: [row('WL6340')],
        maxAllowedPage: 200,
      });
    });

    it('reads the page from TecDoc in its own order', async () => {
      const page = await results.read(
        enumeration([], { total: WIDE_TOTAL }),
        CALL,
        scope({ page: 3, pageSize: 20, vehicleId: 10042 }),
      );

      expect(readRowsPageMock).toHaveBeenCalledWith({
        ...CALL,
        vehicleId: 10042,
        page: 3,
        pageSize: 20,
        sort: SearchSort.Availability,
        filters: {},
      });
      expect(page.items).toEqual([row('WL6340')]);
      expect(page.ordering).toBe('catalogue');
      expect(page.isRankable).toBe(false);
    });

    /**
     * The response must not claim an order it did not apply. A visitor told "in
     * stock first" over a list that is not in that order has been made a promise
     * we had no way to keep.
     */
    it.each([
      SearchSort.Availability,
      SearchSort.PriceAscending,
      SearchSort.PriceDescending,
    ])('reports %s as the catalogue order it fell back to', async (sort) => {
      const page = await results.read(
        enumeration([], { total: WIDE_TOTAL }),
        CALL,
        scope({ sort }),
      );

      expect(page.ordering).toBe(SearchSort.Catalogue);
    });

    /**
     * The alphabetical axes survive a set this wide, because TecDoc applies them
     * itself across every match before it pages.
     */
    it.each([SearchSort.Brand, SearchSort.ArticleNumber])(
      'keeps %s, which TecDoc sorts inside the page read',
      async (sort) => {
        const page = await results.read(
          enumeration([], { total: WIDE_TOTAL }),
          CALL,
          scope({ sort }),
        );

        expect(readRowsPageMock).toHaveBeenCalledWith(
          expect.objectContaining({ sort }),
        );
        expect(page.ordering).toBe(sort);
      },
    );

    // Ranking a truncated set would read as a promise about the whole result.
    it('neither reads stock nor hydrates rows of its own', async () => {
      await results.read(enumeration([], { total: WIDE_TOTAL }), CALL, scope());

      expect(availabilityMock).not.toHaveBeenCalled();
      expect(hydrateMock).not.toHaveBeenCalled();
    });

    // TecDoc serves only the first ~10,000 results, so a set reporting more
    // matches than that will refuse a page the count says exists.
    it('caps maxPage at the ceiling TecDoc reported', async () => {
      const page = await results.read(
        enumeration([], { total: 1_000_000 }),
        CALL,
        scope({ pageSize: 20 }),
      );

      expect(page.maxPage).toBe(200);
    });

    it('uses the page count when it is the lower of the two', async () => {
      const page = await results.read(
        enumeration([], { total: WIDE_TOTAL }),
        CALL,
        scope({ pageSize: 20 }),
      );

      expect(page.maxPage).toBe(Math.ceil(WIDE_TOTAL / 20));
    });

    it('reports the whole match count as its total', async () => {
      const page = await results.read(
        enumeration([], { total: WIDE_TOTAL }),
        CALL,
        scope(),
      );

      expect(page.total).toBe(WIDE_TOTAL);
    });

    // Narrowing the twenty rows TecDoc happened to return would answer "what can
    // we ship" over an arbitrary slice of a million matches. The absent counts
    // are what tell the client the control is not on offer here.
    it('drops a stock narrowing it cannot honour, and offers no counts', async () => {
      const page = await results.read(
        enumeration([], { total: WIDE_TOTAL }),
        CALL,
        scope({ filters: { stockScope: 'central' } }),
      );

      expect(page.items).toEqual([row('WL6340')]);
      expect(page.total).toBe(WIDE_TOTAL);
      expect(page.stockScopeCounts).toBeNull();
      expect(availabilityMock).not.toHaveBeenCalled();
    });
  });

  // The boundary the two paths meet at, stated once so a change to the limit
  // cannot silently move which tier a set of exactly that size gets.
  describe('the tier boundary', () => {
    it('ranks a set of exactly the sortable limit', async () => {
      await results.read(
        enumeration(candidates(3), { total: SEARCH_SORTABLE_LIMIT }),
        CALL,
        scope(),
      );

      expect(readRowsPageMock).not.toHaveBeenCalled();
      expect(availabilityMock).toHaveBeenCalled();
    });

    it('falls back one match past it', async () => {
      readRowsPageMock.mockResolvedValue({ items: [], maxAllowedPage: 1 });

      await results.read(
        enumeration([], { total: SEARCH_SORTABLE_LIMIT + 1 }),
        CALL,
        scope(),
      );

      expect(readRowsPageMock).toHaveBeenCalled();
      expect(availabilityMock).not.toHaveBeenCalled();
    });
  });
});
