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
import { outcomeForStatus } from './delivery';
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
        return outcomeForStatus(StockStatus.DELIVERY_WITHIN_HOUR);
      case 'AUTOPLUS':
        return outcomeForStatus(StockStatus.DELIVERY_SAME_DAY);
      case 'AUTO1':
        return outcomeForStatus(StockStatus.DELIVERY_IN_2_DAYS);
      default:
        return null;
    }
  },
} as unknown as DeliverySpeedResolver;

const config = {
  get: (key: string) => (key === 'VAT_RATE' ? 0.2 : undefined),
} as unknown as ConfigService;

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
        quantity: 4,
        priceExVat: 5000,
        priceIncVat: 6000,
        availabilityByDelivery: [
          {
            stockStatus: StockStatus.IN_STOCK,
            estimatedDeliveryDays: 0,
            quantity: 4,
          },
          {
            stockStatus: StockStatus.DELIVERY_WITHIN_HOUR,
            estimatedDeliveryDays: 0,
            quantity: 3,
          },
        ],
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
      expect(result.quantity).toBe(4);
      expect(result.priceIncVat).toBe(4800);
      expect(result.priceExVat).toBe(Math.round(4800 / 1.2));
    });

    it('reports available quantity per delivery window (today, next day, ...)', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([
        supplierRow({ supplierSource: 'INTERCARS', availability: 3 }),
        supplierRow({ supplierSource: 'AUTO1', availability: 5 }),
      ]);

      const result = await service.getAvailability('WL6340');

      expect(result.availabilityByDelivery).toEqual([
        {
          stockStatus: StockStatus.DELIVERY_WITHIN_HOUR,
          estimatedDeliveryDays: 0,
          quantity: 3,
        },
        {
          stockStatus: StockStatus.DELIVERY_IN_2_DAYS,
          estimatedDeliveryDays: 2,
          quantity: 5,
        },
      ]);
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
      expect(result.quantity).toBe(3);
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
      expect(result.quantity).toBe(0);
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
      expect(result.quantity).toBe(0);
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

      // Only the valid line counts towards the displayed quantity.
      expect(result.available).toBe(true);
      expect(result.quantity).toBe(5);
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
      expect(result.quantity).toBe(5);
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

    it('fails open to unavailable for all articles on a database error', async () => {
      ownFindByNumbers.mockRejectedValueOnce(new Error('db down'));
      supplierFindByNumbers.mockResolvedValueOnce(new Map());

      const result = await service.getBulkPricesAndAvailability(['A', 'B']);

      expect(result.get('A')?.available).toBe(false);
      expect(result.get('B')?.available).toBe(false);
    });
  });
});
