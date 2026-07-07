import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    it('returns an empty map for an empty input without querying', async () => {
      const result = await service.getAvailability([]);

      expect(result.size).toBe(0);
      expect(ownFindByNumber).not.toHaveBeenCalled();
      expect(ownFindByNumbers).not.toHaveBeenCalled();
      expect(supplierFindByNumber).not.toHaveBeenCalled();
      expect(supplierFindByNumbers).not.toHaveBeenCalled();
    });

    describe('single article (single-row read)', () => {
      it('uses the single-row query, not the batch query', async () => {
        ownFindByNumber.mockResolvedValueOnce([]);
        supplierFindByNumber.mockResolvedValueOnce([]);

        await service.getAvailability(['WL6340']);

        expect(ownFindByNumber).toHaveBeenCalledWith('WL6340');
        expect(supplierFindByNumber).toHaveBeenCalledWith('WL6340');
        expect(ownFindByNumbers).not.toHaveBeenCalled();
        expect(supplierFindByNumbers).not.toHaveBeenCalled();
      });

      it('locks the price to our own stock and ships it immediately', async () => {
        ownFindByNumber.mockResolvedValueOnce([
          ownRow({ availableQuantity: 4 }),
        ]);
        supplierFindByNumber.mockResolvedValueOnce([
          supplierRow({ availability: 3, sellPriceCents: 5200 }),
        ]);

        const result = await service.getAvailability(['WL6340']);

        expect(result.get('WL6340')).toEqual({
          available: true,
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

        const detail = (await service.getAvailability(['WL6340'])).get(
          'WL6340',
        );

        expect(detail?.priceIncVat).toBe(4800);
        expect(detail?.priceExVat).toBe(Math.round(4800 / 1.2));
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

        const detail = (await service.getAvailability(['WL6340'])).get(
          'WL6340',
        );

        expect(detail?.available).toBe(true);
        // Supplier sell price is VAT-inclusive; ex-VAT is derived from it.
        expect(detail?.priceIncVat).toBe(5300);
        expect(detail?.priceExVat).toBe(Math.round(5300 / 1.2));
      });

      it('returns an out-of-stock availability when nobody has stock', async () => {
        ownFindByNumber.mockResolvedValueOnce([]);
        supplierFindByNumber.mockResolvedValueOnce([]);

        const detail = (await service.getAvailability(['WL6340'])).get(
          'WL6340',
        );

        expect(detail?.available).toBe(false);
        expect(detail?.priceExVat).toBeNull();
        expect(detail?.priceIncVat).toBeNull();
      });

      it('drops an unknown supplier/warehouse line (no delivery rule) and treats it as out of stock', async () => {
        ownFindByNumber.mockResolvedValueOnce([]);
        supplierFindByNumber.mockResolvedValueOnce([
          supplierRow({ supplierSource: 'MYSTERY', availability: 9 }),
        ]);

        const detail = (await service.getAvailability(['WL6340'])).get(
          'WL6340',
        );

        expect(detail?.available).toBe(false);
        expect(detail?.availabilityByWarehouse).toEqual([]);
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

        const detail = (await service.getAvailability(['WL6340'])).get(
          'WL6340',
        );

        expect(detail?.availabilityByWarehouse).toEqual([
          warehouseRow('CENTRAL', 2),
          warehouseRow('REGIONAL_1', 5),
          warehouseRow('ROMANIA', 9),
        ]);
      });

      it('omits warehouses that hold no stock', async () => {
        ownFindByNumber.mockResolvedValueOnce([
          ownRow({ availableQuantity: 3 }),
        ]);
        supplierFindByNumber.mockResolvedValueOnce([]);

        const detail = (await service.getAvailability(['WL6340'])).get(
          'WL6340',
        );

        expect(detail?.availabilityByWarehouse).toEqual([
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

        const detail = (await service.getAvailability(['WL6340'])).get(
          'WL6340',
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
        ownFindByNumber.mockRejectedValueOnce(new Error('db down'));
        supplierFindByNumber.mockResolvedValueOnce([]);

        await expect(
          service.getAvailability(['WL6340']),
        ).rejects.toBeInstanceOf(InventoryUnavailableException);

        errorSpy.mockRestore();
      });
    });

    describe('multiple articles (batch read)', () => {
      it('uses the batch query, not the single-row query', async () => {
        ownFindByNumbers.mockResolvedValueOnce(new Map());
        supplierFindByNumbers.mockResolvedValueOnce(new Map());

        await service.getAvailability(['A', 'B']);

        expect(ownFindByNumbers).toHaveBeenCalledWith(['A', 'B']);
        expect(supplierFindByNumbers).toHaveBeenCalledWith(['A', 'B']);
        expect(ownFindByNumber).not.toHaveBeenCalled();
        expect(supplierFindByNumber).not.toHaveBeenCalled();
      });

      it('resolves an offer per requested number, with warehouses always attached', async () => {
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

        const result = await service.getAvailability([
          'OWNED',
          'SUPPLIED',
          'MISSING',
        ]);

        const owned = result.get('OWNED');
        expect(owned?.priceIncVat).toBe(6000);
        // Every entry carries the request-time warehouse projection now.
        expect(owned?.availabilityByWarehouse.length).toBeGreaterThan(0);
        expect(owned?.computedAt).not.toBeNull();
        expect(result.get('SUPPLIED')?.available).toBe(true);
        expect(result.get('SUPPLIED')?.priceIncVat).toBe(4000);
        expect(result.get('MISSING')?.available).toBe(false);
      });

      it('fails closed with InventoryUnavailableException on a database error', async () => {
        const errorSpy = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);
        ownFindByNumbers.mockRejectedValueOnce(new Error('db down'));
        supplierFindByNumbers.mockResolvedValueOnce(new Map());

        await expect(
          service.getAvailability(['A', 'B']),
        ).rejects.toBeInstanceOf(InventoryUnavailableException);

        errorSpy.mockRestore();
      });
    });
  });
});
