import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StockStatus } from '@vp-parts-shop/shared';
import { InventoryService } from './inventory.service';
import { AutopartsRepository, OwnStockRow } from './autoparts.repository';
import {
  SupplierStockRepository,
  SupplierStockRow,
} from './supplier-stock.repository';
import { DeliverySpeedResolver } from './delivery-speed.resolver';
import { DeliveryScheduleService } from './delivery-schedule.service';
import { DeliveryRule, outcomeForStatus } from './delivery';
import { InventoryUnavailableException } from './inventory-unavailable.exception';

const ownFindByNumber = jest.fn();
const ownFindByNumbers = jest.fn();
const supplierFindByNumber = jest.fn();
const supplierFindByNumbers = jest.fn();

const ownStock = {
  findByTecdocNumber: ownFindByNumber,
  findByTecdocNumbers: ownFindByNumbers,
} as unknown as AutopartsRepository;

const supplierStock = {
  findByTecdocNumber: supplierFindByNumber,
  findByTecdocNumbers: supplierFindByNumbers,
} as unknown as SupplierStockRepository;

// Deterministic resolver: INTERCARS within hour, AUTOPLUS same day, AUTO1 2
// days; any other (unknown) source resolves to null so the service drops it.
const deliverySpeed = {
  resolve: (source: string) => {
    switch (source) {
      case 'INTERCARS':
        return {
          rule: DeliveryRule.WITHIN_HOUR,
          outcome: outcomeForStatus(StockStatus.DELIVERY_WITHIN_HOUR),
        };
      case 'AUTOPLUS':
        return {
          rule: DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
          outcome: outcomeForStatus(StockStatus.DELIVERY_SAME_DAY),
        };
      case 'AUTO1':
        return {
          rule: DeliveryRule.TWO_BUSINESS_DAYS,
          outcome: outcomeForStatus(StockStatus.DELIVERY_IN_2_DAYS),
        };
      default:
        return null;
    }
  },
} as unknown as DeliverySpeedResolver;

// Deterministic projection so warehouse assertions don't depend on the clock.
const deliverySchedule = {
  projectWarehouse: (warehouse: string) => ({
    deliveryWorkDays: 0,
    orderCutoffTime: '18:00',
    cutoffAt: `cutoff:${warehouse}`,
    pickup: { earliestAt: `pickup:${warehouse}`, granularity: 'DAY' as const },
    courier: {
      earliestAt: `courier:${warehouse}`,
      granularity: 'DAY' as const,
    },
  }),
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

function ownRow(overrides: Partial<OwnStockRow> = {}): OwnStockRow {
  return {
    tecdocNumber: 'WL6340',
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
    it('locks the price to our own stock and ships it immediately (IN_STOCK)', async () => {
      ownFindByNumber.mockResolvedValueOnce([ownRow({ availableQuantity: 4 })]);
      supplierFindByNumber.mockResolvedValueOnce([
        supplierRow({ availability: 3, sellPriceCents: 5200 }),
      ]);

      const result = await service.getAvailability('WL6340');

      expect(result).toEqual({
        articleNumber: 'WL6340',
        available: true,
        stockStatus: StockStatus.IN_STOCK,
        estimatedDeliveryDays: 0,
        priceExVat: 5000,
        priceIncVat: 6000,
        // Own stock (4) and the within-hour supplier (3) unite into Central.
        availabilityByWarehouse: [warehouseRow('CENTRAL', 7)],
        computedAt: expect.any(String),
      });
    });

    it('raises the displayed price to the cheapest supplier when our price undercuts them', async () => {
      ownFindByNumber.mockResolvedValueOnce([
        ownRow({
          availableQuantity: 4,
          sellPriceExVatCents: 3000,
          sellPriceIncVatCents: 3600,
        }),
      ]);
      supplierFindByNumber.mockResolvedValueOnce([
        supplierRow({
          availability: 3,
          buyPriceCents: 3000,
          sellPriceCents: 4800,
        }),
      ]);

      const result = await service.getAvailability('WL6340');

      expect(result.stockStatus).toBe(StockStatus.IN_STOCK);
      expect(result.priceIncVat).toBe(4800);
      expect(result.priceExVat).toBe(Math.round(4800 / 1.2));
    });

    it('falls back to the lowest-buy-price supplier within the fastest band when we do not carry the part', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([
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

      const result = await service.getAvailability('WL6340');

      expect(result.available).toBe(true);
      expect(result.stockStatus).toBe(StockStatus.DELIVERY_WITHIN_HOUR);
      expect(result.estimatedDeliveryDays).toBe(0);
      // Supplier sell price is VAT-inclusive; ex-VAT is derived from it.
      expect(result.priceIncVat).toBe(5300);
      expect(result.priceExVat).toBe(Math.round(5300 / 1.2));
    });

    it('returns an out-of-stock availability when nobody has stock', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([]);

      const result = await service.getAvailability('WL6340');

      expect(result.available).toBe(false);
      expect(result.stockStatus).toBe(StockStatus.OUT_OF_STOCK);
      expect(result.priceExVat).toBeNull();
      expect(result.priceIncVat).toBeNull();
    });

    it('fails closed with InventoryUnavailableException on a database error', async () => {
      ownFindByNumber.mockRejectedValueOnce(new Error('db down'));
      supplierFindByNumber.mockResolvedValueOnce([]);

      await expect(service.getAvailability('WL6340')).rejects.toBeInstanceOf(
        InventoryUnavailableException,
      );
    });

    it('drops an unknown supplier/warehouse line (no delivery rule) and treats it as out of stock', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([
        supplierRow({ supplierSource: 'MYSTERY', availability: 9 }),
      ]);

      const result = await service.getAvailability('WL6340');

      expect(result.available).toBe(false);
      expect(result.stockStatus).toBe(StockStatus.OUT_OF_STOCK);
      expect(result.availabilityByWarehouse).toEqual([]);
    });

    it('groups stock into fastest-first warehouses by inherent capability', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([
        // Same-day capable -> Regional 1.
        supplierRow({ supplierSource: 'AUTOPLUS', availability: 5 }),
        // Within the hour -> Central.
        supplierRow({ supplierSource: 'INTERCARS', availability: 2 }),
        // 2 days -> Romania.
        supplierRow({ supplierSource: 'AUTO1', availability: 9 }),
      ]);

      const result = await service.getAvailability('WL6340');

      expect(result.availabilityByWarehouse).toEqual([
        warehouseRow('CENTRAL', 2),
        warehouseRow('REGIONAL_1', 5),
        warehouseRow('ROMANIA', 9),
      ]);
    });

    it('omits warehouses that hold no stock', async () => {
      ownFindByNumber.mockResolvedValueOnce([ownRow({ availableQuantity: 3 })]);
      supplierFindByNumber.mockResolvedValueOnce([]);

      const result = await service.getAvailability('WL6340');

      expect(result.availabilityByWarehouse).toEqual([
        warehouseRow('CENTRAL', 3),
      ]);
    });

    it('drops a line with an unknown quantity and raises an alert', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([
        supplierRow({ supplierSource: 'INTERCARS', availability: null }),
        supplierRow({
          supplierSource: 'INTERCARS',
          availability: 5,
          buyPriceCents: 4000,
          sellPriceCents: 5300,
        }),
      ]);

      const result = await service.getAvailability('WL6340');

      // Only the valid line (5) counts towards the Central warehouse quantity.
      expect(result.available).toBe(true);
      expect(result.availabilityByWarehouse).toEqual([
        warehouseRow('CENTRAL', 5),
      ]);
      expect(errorSpy).toHaveBeenCalledTimes(1);

      errorSpy.mockRestore();
    });
  });

  describe('getBestPriceAndAvailability', () => {
    it('returns the best offer mapped to price/availability', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([
        supplierRow({ availability: 5, sellPriceCents: 5500 }),
      ]);

      const result = await service.getBestPriceAndAvailability('WL6340');

      expect(result.available).toBe(true);
      expect(result.priceIncVat).toBe(5500);
      expect(result.priceExVat).toBe(Math.round(5500 / 1.2));
    });

    it('embeds the per-warehouse breakdown and a computedAt (dynamic detail path)', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([
        supplierRow({ availability: 5 }),
      ]);

      const result = await service.getBestPriceAndAvailability('WL6340');

      // INTERCARS (within the hour) groups into Central; the article detail page
      // is dynamic SSR, so the request-time dates are safe to embed here.
      expect(result.availabilityByWarehouse).toEqual([
        warehouseRow('CENTRAL', 5),
      ]);
      expect(result.computedAt).toEqual(expect.any(String));
    });

    it('fails open to the neutral unavailable state on a database error', async () => {
      ownFindByNumber.mockRejectedValueOnce(new Error('db down'));
      supplierFindByNumber.mockResolvedValueOnce([]);

      const result = await service.getBestPriceAndAvailability('WL6340');

      expect(result.available).toBe(false);
      expect(result.stockStatus).toBe(StockStatus.OUT_OF_STOCK);
      expect(result.priceIncVat).toBeNull();
    });
  });

  describe('getBulkPricesAndAvailability', () => {
    it('returns an empty map for an empty input without querying', async () => {
      const result = await service.getBulkPricesAndAvailability([]);

      expect(result.size).toBe(0);
      expect(ownFindByNumbers).not.toHaveBeenCalled();
      expect(supplierFindByNumbers).not.toHaveBeenCalled();
    });

    it('resolves an offer per requested article number', async () => {
      ownFindByNumbers.mockResolvedValueOnce(
        new Map([['OWNED', [ownRow({ tecdocNumber: 'OWNED' })]]]),
      );
      supplierFindByNumbers.mockResolvedValueOnce(
        new Map([
          [
            'SUPPLIED',
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

      const result = await service.getBulkPricesAndAvailability([
        'OWNED',
        'SUPPLIED',
        'MISSING',
      ]);

      expect(result.get('OWNED')?.priceIncVat).toBe(6000);
      expect(result.get('SUPPLIED')?.available).toBe(true);
      expect(result.get('SUPPLIED')?.priceIncVat).toBe(4000);
      expect(result.get('MISSING')?.available).toBe(false);
    });

    it('omits warehouse dates on the cached bulk path (empty breakdown, null computedAt)', async () => {
      ownFindByNumbers.mockResolvedValueOnce(new Map());
      supplierFindByNumbers.mockResolvedValueOnce(
        new Map([
          [
            'SUPPLIED',
            [supplierRow({ tecdocNumber: 'SUPPLIED', availability: 6 })],
          ],
        ]),
      );

      const result = await service.getBulkPricesAndAvailability(['SUPPLIED']);

      // Listings are cached, so embedding absolute request-time dates would
      // serve stale promises: the breakdown stays empty and computedAt null.
      const supplied = result.get('SUPPLIED');
      expect(supplied?.available).toBe(true);
      expect(supplied?.availabilityByWarehouse).toEqual([]);
      expect(supplied?.computedAt).toBeNull();
    });

    it('fails open to unavailable for all articles on a database error', async () => {
      ownFindByNumbers.mockRejectedValueOnce(new Error('db down'));
      supplierFindByNumbers.mockResolvedValueOnce(new Map());

      const result = await service.getBulkPricesAndAvailability(['A', 'B']);

      expect(result.get('A')?.available).toBe(false);
      expect(result.get('B')?.available).toBe(false);
    });
  });
});
