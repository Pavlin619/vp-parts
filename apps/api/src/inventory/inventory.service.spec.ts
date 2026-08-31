import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { articleIdentityKey } from '@vp-parts-shop/shared';
import { InventoryService } from './inventory.service';
import { AutopartsRepository, OwnStockRow } from './autoparts.repository';
import {
  SupplierStockRepository,
  SupplierStockRow,
} from './supplier-stock.repository';
import { DeliverySpeedResolver } from './delivery-speed.resolver';
import { DeliveryScheduleService } from './delivery-schedule.service';
import { DeliveryRule, rankForRule } from './delivery';
import { InventoryUnavailableException } from './inventory-unavailable.exception';

const ownFindByArticle = jest.fn();
const ownFindByArticles = jest.fn();
const supplierFindByArticle = jest.fn();
const supplierFindByArticles = jest.fn();

const ownStock = {
  findByArticle: ownFindByArticle,
  findByArticles: ownFindByArticles,
} as unknown as AutopartsRepository;

const supplierStock = {
  findByArticle: supplierFindByArticle,
  findByArticles: supplierFindByArticles,
} as unknown as SupplierStockRepository;

// Deterministic resolver: INTERCARS within hour, AUTOPLUS same day, AUTO1 2
// days; any other (unknown) source resolves to null so the service drops it.
const deliverySpeed = {
  resolve: (source: string) => {
    switch (source) {
      case 'INTERCARS':
        return {
          rule: DeliveryRule.WITHIN_HOUR,
          outcome: { rank: rankForRule(DeliveryRule.WITHIN_HOUR) },
        };
      case 'AUTOPLUS':
        return {
          rule: DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
          outcome: { rank: rankForRule(DeliveryRule.SAME_DAY_BEFORE_CUTOFF) },
        };
      case 'AUTO1':
        return {
          rule: DeliveryRule.TWO_BUSINESS_DAYS,
          outcome: { rank: rankForRule(DeliveryRule.TWO_BUSINESS_DAYS) },
        };
      default:
        return null;
    }
  },
} as unknown as DeliverySpeedResolver;

// Deterministic projection so warehouse assertions don't depend on the clock.
const projectWarehouse = jest.fn((warehouse: string) => ({
  deliveryWorkDays: 0,
  orderCutoffTime: '18:00',
  cutoffAt: `cutoff:${warehouse}`,
  pickup: { earliestAt: `pickup:${warehouse}`, granularity: 'DAY' as const },
  courier: {
    earliestAt: `courier:${warehouse}`,
    granularity: 'DAY' as const,
  },
}));

const deliverySchedule = {
  projectWarehouse,
} as unknown as DeliveryScheduleService;

const config = {
  get: (key: string) => (key === 'VAT_RATE' ? 0.2 : undefined),
} as unknown as ConfigService;

function warehouseRow(warehouseId: string, quantity: number) {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: '18:00',
    cutoffAt: `cutoff:${warehouseId}`,
    pickup: { earliestAt: `pickup:${warehouseId}`, granularity: 'DAY' },
    courier: { earliestAt: `courier:${warehouseId}`, granularity: 'DAY' },
  };
}

const BOSCH = '30';
const SPIDAN = '1';

/** The article every fixture below is about, unless a test says otherwise. */
function bosch(articleNumber: string) {
  return { brandId: BOSCH, articleNumber };
}

const WL6340 = bosch('WL6340');
const WL6340_KEY = articleIdentityKey(BOSCH, 'WL6340');

function ownRow(overrides: Partial<OwnStockRow> = {}): OwnStockRow {
  return {
    tecdocNumber: 'WL6340',
    brandId: BOSCH,
    availableQuantity: 4,
    sellPriceExVatCents: 5000,
    sellPriceIncVatCents: 6000,
    ...overrides,
  };
}

function supplierRow(
  overrides: Partial<SupplierStockRow> = {},
): SupplierStockRow {
  return {
    supplierSource: 'INTERCARS',
    warehouseCode: null,
    availability: 3,
    buyPriceCents: 4000,
    sellPriceCents: 5500,
    tecdocNumber: 'WL6340',
    brandId: BOSCH,
    ...overrides,
  };
}

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService(
      ownStock,
      supplierStock,
      deliverySpeed,
      deliverySchedule,
      config,
    );
    jest.clearAllMocks();
  });

  describe('getAvailability', () => {
    it('returns an empty map for an empty input without querying', async () => {
      const result = await service.getAvailability([]);

      expect(result.size).toBe(0);
      expect(ownFindByArticle).not.toHaveBeenCalled();
      expect(ownFindByArticles).not.toHaveBeenCalled();
      expect(supplierFindByArticle).not.toHaveBeenCalled();
      expect(supplierFindByArticles).not.toHaveBeenCalled();
    });

    describe('single article (single-row read)', () => {
      it('uses the single-row query, not the batch query', async () => {
        ownFindByArticle.mockResolvedValueOnce([]);
        supplierFindByArticle.mockResolvedValueOnce([]);

        await service.getAvailability([WL6340]);

        expect(ownFindByArticle).toHaveBeenCalledWith(WL6340);
        expect(supplierFindByArticle).toHaveBeenCalledWith(WL6340);
        expect(ownFindByArticles).not.toHaveBeenCalled();
        expect(supplierFindByArticles).not.toHaveBeenCalled();
      });

      it('locks the price to our own stock and ships it immediately', async () => {
        ownFindByArticle.mockResolvedValueOnce([
          ownRow({ availableQuantity: 4 }),
        ]);
        supplierFindByArticle.mockResolvedValueOnce([
          supplierRow({ availability: 3, sellPriceCents: 5200 }),
        ]);

        const result = await service.getAvailability([WL6340]);

        expect(result.get(WL6340_KEY)).toEqual({
          available: true,
          bestPriceExVat: 5000,
          bestPriceIncVat: 6000,
          // Own stock (4) and the within-hour supplier (3) unite into Central.
          availabilityByWarehouse: [warehouseRow('CENTRAL', 7)],
          computedAt: expect.any(String),
        });
      });

      it('raises the displayed price to the cheapest supplier when our price undercuts them', async () => {
        ownFindByArticle.mockResolvedValueOnce([
          ownRow({
            availableQuantity: 4,
            sellPriceExVatCents: 3000,
            sellPriceIncVatCents: 3600,
          }),
        ]);
        supplierFindByArticle.mockResolvedValueOnce([
          supplierRow({
            availability: 3,
            buyPriceCents: 3000,
            sellPriceCents: 4800,
          }),
        ]);

        const detail = (await service.getAvailability([WL6340])).get(
          WL6340_KEY,
        );

        expect(detail?.bestPriceIncVat).toBe(4800);
        expect(detail?.bestPriceExVat).toBe(Math.round(4800 / 1.2));
      });

      it('falls back to the lowest-buy-price supplier within the fastest band when we do not carry the part', async () => {
        ownFindByArticle.mockResolvedValueOnce([]);
        supplierFindByArticle.mockResolvedValueOnce([
          supplierRow({
            supplierSource: 'INTERCARS',
            availability: 2,
            buyPriceCents: 4000,
            sellPriceCents: 5500,
          }),
          supplierRow({
            supplierSource: 'INTERCARS',
            availability: 1,
            buyPriceCents: 3800,
            sellPriceCents: 5300,
          }),
        ]);

        const detail = (await service.getAvailability([WL6340])).get(
          WL6340_KEY,
        );

        expect(detail?.available).toBe(true);
        // Supplier sell price is VAT-inclusive; ex-VAT is derived from it.
        expect(detail?.bestPriceIncVat).toBe(5300);
        expect(detail?.bestPriceExVat).toBe(Math.round(5300 / 1.2));
      });

      it('returns an out-of-stock availability when nobody has stock', async () => {
        ownFindByArticle.mockResolvedValueOnce([]);
        supplierFindByArticle.mockResolvedValueOnce([]);

        const detail = (await service.getAvailability([WL6340])).get(
          WL6340_KEY,
        );

        expect(detail?.available).toBe(false);
        expect(detail?.bestPriceExVat).toBeNull();
        expect(detail?.bestPriceIncVat).toBeNull();
      });

      it('drops an unknown supplier/warehouse line (no delivery rule) and treats it as out of stock', async () => {
        ownFindByArticle.mockResolvedValueOnce([]);
        supplierFindByArticle.mockResolvedValueOnce([
          supplierRow({ supplierSource: 'MYSTERY', availability: 9 }),
        ]);

        const detail = (await service.getAvailability([WL6340])).get(
          WL6340_KEY,
        );

        expect(detail?.available).toBe(false);
        expect(detail?.availabilityByWarehouse).toEqual([]);
      });

      it('groups stock into fastest-first warehouses by inherent capability', async () => {
        ownFindByArticle.mockResolvedValueOnce([]);
        supplierFindByArticle.mockResolvedValueOnce([
          // Same-day capable -> Regional 1.
          supplierRow({ supplierSource: 'AUTOPLUS', availability: 5 }),
          // Within the hour -> Central.
          supplierRow({ supplierSource: 'INTERCARS', availability: 2 }),
          // 2 days -> Romania.
          supplierRow({ supplierSource: 'AUTO1', availability: 9 }),
        ]);

        const detail = (await service.getAvailability([WL6340])).get(
          WL6340_KEY,
        );

        expect(detail?.availabilityByWarehouse).toEqual([
          warehouseRow('CENTRAL', 2),
          warehouseRow('REGIONAL_1', 5),
          warehouseRow('ROMANIA', 9),
        ]);
      });

      it('omits warehouses that hold no stock', async () => {
        ownFindByArticle.mockResolvedValueOnce([
          ownRow({ availableQuantity: 3 }),
        ]);
        supplierFindByArticle.mockResolvedValueOnce([]);

        const detail = (await service.getAvailability([WL6340])).get(
          WL6340_KEY,
        );

        expect(detail?.availabilityByWarehouse).toEqual([
          warehouseRow('CENTRAL', 3),
        ]);
      });

      it('drops a line with an unknown quantity and raises an alert', async () => {
        const errorSpy = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);
        ownFindByArticle.mockResolvedValueOnce([]);
        supplierFindByArticle.mockResolvedValueOnce([
          supplierRow({ supplierSource: 'INTERCARS', availability: null }),
          supplierRow({
            supplierSource: 'INTERCARS',
            availability: 5,
            buyPriceCents: 4000,
            sellPriceCents: 5300,
          }),
        ]);

        const detail = (await service.getAvailability([WL6340])).get(
          WL6340_KEY,
        );

        // Only the valid line (5) counts towards the Central warehouse quantity.
        expect(detail?.available).toBe(true);
        expect(detail?.availabilityByWarehouse).toEqual([
          warehouseRow('CENTRAL', 5),
        ]);
        expect(errorSpy).toHaveBeenCalledTimes(1);

        errorSpy.mockRestore();
      });

      it('fails closed with InventoryUnavailableException on a database error', async () => {
        const errorSpy = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);
        ownFindByArticle.mockRejectedValueOnce(new Error('db down'));
        supplierFindByArticle.mockResolvedValueOnce([]);

        await expect(service.getAvailability([WL6340])).rejects.toBeInstanceOf(
          InventoryUnavailableException,
        );

        errorSpy.mockRestore();
      });
    });

    describe('multiple articles (batch read)', () => {
      it('uses the batch query, not the single-row query', async () => {
        ownFindByArticles.mockResolvedValueOnce(new Map());
        supplierFindByArticles.mockResolvedValueOnce(new Map());

        await service.getAvailability([bosch('A'), bosch('B')]);

        expect(ownFindByArticles).toHaveBeenCalledWith([
          bosch('A'),
          bosch('B'),
        ]);
        expect(supplierFindByArticles).toHaveBeenCalledWith([
          bosch('A'),
          bosch('B'),
        ]);
        expect(ownFindByArticle).not.toHaveBeenCalled();
        expect(supplierFindByArticle).not.toHaveBeenCalled();
      });

      it('resolves an offer per requested article, with warehouses always attached', async () => {
        ownFindByArticles.mockResolvedValueOnce(
          new Map([
            [
              articleIdentityKey(BOSCH, 'OWNED'),
              [ownRow({ tecdocNumber: 'OWNED' })],
            ],
          ]),
        );
        supplierFindByArticles.mockResolvedValueOnce(
          new Map([
            [
              articleIdentityKey(BOSCH, 'SUPPLIED'),
              [
                supplierRow({
                  tecdocNumber: 'SUPPLIED',
                  availability: 6,
                  sellPriceCents: 4000,
                }),
              ],
            ],
          ]),
        );

        const result = await service.getAvailability([
          bosch('OWNED'),
          bosch('SUPPLIED'),
          bosch('MISSING'),
        ]);

        const owned = result.get(articleIdentityKey(BOSCH, 'OWNED'));
        expect(owned?.bestPriceIncVat).toBe(6000);
        // Every entry carries the request-time warehouse projection now.
        expect(owned?.availabilityByWarehouse.length).toBeGreaterThan(0);
        expect(owned?.computedAt).not.toBeNull();
        expect(
          result.get(articleIdentityKey(BOSCH, 'SUPPLIED'))?.available,
        ).toBe(true);
        expect(
          result.get(articleIdentityKey(BOSCH, 'SUPPLIED'))?.bestPriceIncVat,
        ).toBe(4000);
        expect(
          result.get(articleIdentityKey(BOSCH, 'MISSING'))?.available,
        ).toBe(false);
      });

      it('fails closed with InventoryUnavailableException on a database error', async () => {
        const errorSpy = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);
        ownFindByArticles.mockRejectedValueOnce(new Error('db down'));
        supplierFindByArticles.mockResolvedValueOnce(new Map());

        await expect(
          service.getAvailability([bosch('A'), bosch('B')]),
        ).rejects.toBeInstanceOf(InventoryUnavailableException);

        errorSpy.mockRestore();
      });

      // The projection depends only on the warehouse and the request instant,
      // so recomputing it per article made it ~90% of the cost of a large read.
      it('projects each warehouse once for the whole batch', async () => {
        const articles = ['A', 'B', 'C', 'D'].map(bosch);
        const stocked = new Map(
          articles.map((article) => [
            articleIdentityKey(BOSCH, article.articleNumber),
            [supplierRow({ tecdocNumber: article.articleNumber })],
          ]),
        );
        ownFindByArticles.mockResolvedValueOnce(new Map());
        supplierFindByArticles.mockResolvedValueOnce(stocked);

        await service.getAvailability(articles);

        const projected = projectWarehouse.mock.calls.map(
          ([warehouse]) => warehouse,
        );
        expect(projected).toEqual([...new Set(projected)]);
      });
    });

    // An article number is not unique in TecDoc, so an article is a (brand,
    // number) pair the whole way down: the repositories match on both, and this
    // service keys its answer on both. Without that a customer can be quoted
    // another company's price for the part they are looking at.
    describe('article identity', () => {
      it('answers each brand separately when both file one number', async () => {
        const spidan = { brandId: SPIDAN, articleNumber: 'WL6340' };
        ownFindByArticles.mockResolvedValueOnce(new Map());
        supplierFindByArticles.mockResolvedValueOnce(
          new Map([
            [
              WL6340_KEY,
              [supplierRow({ availability: 2, sellPriceCents: 5500 })],
            ],
            [
              articleIdentityKey(SPIDAN, 'WL6340'),
              [
                supplierRow({
                  brandId: SPIDAN,
                  availability: 4,
                  sellPriceCents: 3300,
                }),
              ],
            ],
          ]),
        );

        const result = await service.getAvailability([WL6340, spidan]);

        expect(supplierFindByArticles).toHaveBeenCalledWith([WL6340, spidan]);
        expect(result.get(WL6340_KEY)?.bestPriceIncVat).toBe(5500);
        expect(
          result.get(articleIdentityKey(SPIDAN, 'WL6340'))?.bestPriceIncVat,
        ).toBe(3300);
      });

      it('asks for a repeated article once', async () => {
        ownFindByArticle.mockResolvedValueOnce([]);
        supplierFindByArticle.mockResolvedValueOnce([]);

        const result = await service.getAvailability([WL6340, { ...WL6340 }]);

        expect(supplierFindByArticle).toHaveBeenCalledTimes(1);
        expect(supplierFindByArticles).not.toHaveBeenCalled();
        expect(result.get(WL6340_KEY)?.available).toBe(false);
      });
    });
  });

  /**
   * The one read that answers a stock-DB outage with a value. It exists so the
   * list surfaces that order by availability degrade to catalogue order, and so
   * that swallowing the exception takes a deliberate call to a differently-named
   * method rather than a try/catch in each surface.
   */
  describe('getAvailabilityForOrdering', () => {
    it('answers with the same availability the read returns', async () => {
      ownFindByArticle.mockResolvedValueOnce([]);
      supplierFindByArticle.mockResolvedValueOnce([
        supplierRow({ availability: 2, sellPriceCents: 5500 }),
      ]);

      const availability = await service.getAvailabilityForOrdering([WL6340]);

      expect(availability?.get(WL6340_KEY)?.bestPriceIncVat).toBe(5500);
    });

    it('answers with null and warns when the read fails', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      ownFindByArticle.mockRejectedValueOnce(new Error('db down'));
      supplierFindByArticle.mockResolvedValueOnce([]);

      await expect(
        service.getAvailabilityForOrdering([WL6340]),
      ).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('availability unavailable'),
      );

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    // Null rather than an empty map: there is nothing to order, and an empty map
    // would read to the ordering as "every row is out of stock".
    it('answers with null for an empty set without querying', async () => {
      await expect(service.getAvailabilityForOrdering([])).resolves.toBeNull();
      expect(ownFindByArticle).not.toHaveBeenCalled();
      expect(ownFindByArticles).not.toHaveBeenCalled();
    });
  });
});
