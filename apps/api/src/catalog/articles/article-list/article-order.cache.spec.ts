import {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
  WarehouseId,
  articleIdentityKey,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../../redis';
import { InventoryService } from '../../../inventory';
import { ArticleStatus } from '../../../tecdoc';
import { ArticleOrderCache, RankableArticle } from './article-order.cache';

const readMemoMock = jest.fn();
const writeMemoMock = jest.fn();
const availabilityMock = jest.fn();

const mockCache = {
  readMemo: readMemoMock,
  writeMemo: writeMemoMock,
} as unknown as RedisCache;

const mockInventory = {
  getAvailabilityForOrdering: availabilityMock,
} as unknown as InventoryService;

const WIX = '268';
const KEY = 'search:order:abc';
const ORDER_TTL = 5 * 60;

function candidate(
  articleNumber: string,
  overrides: Partial<RankableArticle> = {},
): RankableArticle {
  return {
    brandId: WIX,
    brandName: 'WIX',
    articleNumber,
    legacyArticleIds: [1],
    articleStatusId: ArticleStatus.Normal,
    ...overrides,
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

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: warehouseId === 'CENTRAL' ? 0 : 1,
    orderCutoffTime: '17:00',
    cutoffAt: '2026-08-23T14:00:00.000Z',
    pickup: { earliestAt: '2026-08-23T15:00:00.000Z', granularity: 'DAY' },
    courier: { earliestAt: '2026-08-24T06:00:00.000Z', granularity: 'DAY' },
  };
}

function availabilityOf(
  entries: Record<string, WarehouseAvailabilityDto[]>,
): Map<string, ArticleInventoryDetailDto> {
  return new Map(
    Object.entries(entries).map(([articleNumber, warehouses]) => [
      articleIdentityKey(WIX, articleNumber),
      {
        ...IN_STOCK,
        available: warehouses.some((entry) => entry.quantity > 0),
        availabilityByWarehouse: warehouses,
      },
    ]),
  );
}

function scopesOf(stored: unknown, index: number) {
  return (stored as { stockScopes?: string[] }[])[index].stockScopes;
}

describe('ArticleOrderCache', () => {
  let order: ArticleOrderCache;

  beforeEach(() => {
    jest.resetAllMocks();
    readMemoMock.mockResolvedValue(undefined);
    availabilityMock.mockResolvedValue(null);

    order = new ArticleOrderCache(mockCache, mockInventory);
  });

  describe('ranking a set', () => {
    it('puts what we can ship first', async () => {
      availabilityMock.mockResolvedValue(stocked('B-STOCKED'));

      const ordered = await order.ordered(KEY, [
        candidate('A-NO-STOCK'),
        candidate('B-STOCKED'),
      ]);

      expect(ordered.map((entry) => entry.articleNumber)).toEqual([
        'B-STOCKED',
        'A-NO-STOCK',
      ]);
    });

    // The ranking is only meaningful if it saw every row, which is why a list
    // reads its set whole before it reads a page of it.
    it('reads stock for every article it was given', async () => {
      await order.ordered(KEY, [candidate('WL6340'), candidate('WL6341')]);

      expect(availabilityMock).toHaveBeenCalledWith([
        { brandId: WIX, articleNumber: 'WL6340' },
        { brandId: WIX, articleNumber: 'WL6341' },
      ]);
    });

    it('answers an empty set without reading stock for it', async () => {
      const ordered = await order.ordered(KEY, []);

      expect(ordered).toEqual([]);
      expect(availabilityMock).toHaveBeenCalledWith([]);
    });
  });

  describe('what gets stored', () => {
    it('pins the ranking under the caller’s key', async () => {
      availabilityMock.mockResolvedValue(stocked('B-STOCKED'));

      await order.ordered(KEY, [
        candidate('A-NO-STOCK', { legacyArticleIds: [11] }),
        candidate('B-STOCKED', { legacyArticleIds: [22] }),
      ]);

      expect(writeMemoMock).toHaveBeenCalledWith(
        KEY,
        [
          {
            brandId: WIX,
            articleNumber: 'B-STOCKED',
            legacyArticleIds: [22],
            stockScopes: ['central'],
          },
          {
            brandId: WIX,
            articleNumber: 'A-NO-STOCK',
            legacyArticleIds: [11],
            stockScopes: [],
          },
        ],
        ORDER_TTL,
      );
    });

    // Everything a row renders is read back through the row cache, so a stored
    // order must not carry a copy of it going stale alongside.
    it('stores identities and origins alone, not the rows they came from', async () => {
      availabilityMock.mockResolvedValue(stocked('WL6340'));

      await order.ordered(KEY, [
        candidate('WL6340', { brandName: 'WIX Filters' }),
      ]);

      expect(Object.keys(writeMemoMock.mock.calls[0][1][0]).sort()).toEqual([
        'articleNumber',
        'brandId',
        'legacyArticleIds',
        'stockScopes',
      ]);
    });

    // Ranked without stock the order is already deterministic from catalogue
    // data, so it needs no pin — and pinning it would hold the degraded order
    // for minutes after the stock database came back.
    it('pins nothing when it ranked without stock', async () => {
      availabilityMock.mockResolvedValue(null);

      const ordered = await order.ordered(KEY, [
        candidate('WL6341'),
        candidate('WL6340'),
      ]);

      expect(ordered.map((entry) => entry.articleNumber)).toEqual([
        'WL6340',
        'WL6341',
      ]);
      expect(writeMemoMock).not.toHaveBeenCalled();
    });
  });

  // Recorded here rather than read again by whoever narrows the list: the stock
  // is already in hand at this point, and a second read would answer a fresher
  // question than the positions it narrows.
  describe('the stock origins it records', () => {
    it('records our own shelf as central', async () => {
      availabilityMock.mockResolvedValue(
        availabilityOf({ A: [warehouse('CENTRAL', 3)] }),
      );

      await order.ordered(KEY, [candidate('A')]);

      expect(scopesOf(writeMemoMock.mock.calls[0][1], 0)).toEqual(['central']);
    });

    it('records every other warehouse as external', async () => {
      availabilityMock.mockResolvedValue(
        availabilityOf({
          A: [warehouse('REGIONAL_1', 1)],
          B: [warehouse('ROMANIA', 1)],
          C: [warehouse('POLAND', 1)],
        }),
      );

      await order.ordered(KEY, [
        candidate('A'),
        candidate('B'),
        candidate('C'),
      ]);

      const stored = writeMemoMock.mock.calls[0][1];
      expect([0, 1, 2].map((index) => scopesOf(stored, index))).toEqual([
        ['external'],
        ['external'],
        ['external'],
      ]);
    });

    // The origins are predicates over one article, not a partition of it.
    it('records both when both hold the part', async () => {
      availabilityMock.mockResolvedValue(
        availabilityOf({
          A: [warehouse('CENTRAL', 2), warehouse('POLAND', 9)],
        }),
      );

      await order.ordered(KEY, [candidate('A')]);

      expect(scopesOf(writeMemoMock.mock.calls[0][1], 0)).toEqual([
        'central',
        'external',
      ]);
    });

    // A filter that listed these would offer parts nobody can ship.
    it('ignores a warehouse holding none of it', async () => {
      availabilityMock.mockResolvedValue(
        availabilityOf({ A: [warehouse('CENTRAL', 0)] }),
      );

      await order.ordered(KEY, [candidate('A')]);

      expect(scopesOf(writeMemoMock.mock.calls[0][1], 0)).toEqual([]);
    });

    // A successful read reports a part nobody stocks by having no warehouses for
    // it, so "no origin" is the answer — distinct from the unknown below.
    it('records an article the read had no row for as shipped from nowhere', async () => {
      availabilityMock.mockResolvedValue(availabilityOf({}));

      await order.ordered(KEY, [candidate('MISSING')]);

      expect(scopesOf(writeMemoMock.mock.calls[0][1], 0)).toEqual([]);
    });

    // Nothing is pinned in this case, so this is about what the caller is handed:
    // absent origins are what tell a stock control it cannot be offered.
    it('leaves the origins unknown when stock could not be read', async () => {
      availabilityMock.mockResolvedValue(null);

      const ordered = await order.ordered(KEY, [candidate('A')]);

      expect(ordered[0].stockScopes).toBeUndefined();
    });
  });

  describe('a pinned order', () => {
    it('is returned without ranking anything again', async () => {
      const pinned = [
        { brandId: WIX, articleNumber: 'PINNED-2', legacyArticleIds: [2] },
        { brandId: WIX, articleNumber: 'PINNED-1', legacyArticleIds: [1] },
      ];
      readMemoMock.mockResolvedValue(pinned);

      const ordered = await order.ordered(KEY, [
        candidate('PINNED-1'),
        candidate('PINNED-2'),
      ]);

      expect(ordered).toEqual(pinned);
      expect(availabilityMock).not.toHaveBeenCalled();
      expect(writeMemoMock).not.toHaveBeenCalled();
    });

    it('is read from the key it was pinned under', async () => {
      await order.ordered('crossrefs:order:268:WL6340', [candidate('WL6340')]);

      expect(readMemoMock).toHaveBeenCalledWith('crossrefs:order:268:WL6340');
    });
  });
});
