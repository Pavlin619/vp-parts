import {
  ArticleInventoryDetailDto,
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
          { brandId: WIX, articleNumber: 'B-STOCKED', legacyArticleIds: [22] },
          { brandId: WIX, articleNumber: 'A-NO-STOCK', legacyArticleIds: [11] },
        ],
        ORDER_TTL,
      );
    });

    // Everything a row renders is read back through the row cache, so a stored
    // order must not carry a copy of it going stale alongside.
    it('stores identities alone, not the rows they came from', async () => {
      availabilityMock.mockResolvedValue(stocked('WL6340'));

      await order.ordered(KEY, [
        candidate('WL6340', { brandName: 'WIX Filters' }),
      ]);

      expect(writeMemoMock.mock.calls[0][1]).toEqual([
        { brandId: WIX, articleNumber: 'WL6340', legacyArticleIds: [1] },
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
