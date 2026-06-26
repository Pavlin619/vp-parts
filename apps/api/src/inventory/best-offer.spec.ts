import { StockStatus } from '@vp-parts-shop/shared';
import {
  selectBestOffer,
  BestOfferInput,
  BestOfferOptions,
  SupplierOffer,
} from './best-offer';
import { outcomeForStatus } from './delivery';

// Deterministic delivery mapping for tests, keyed by supplier source:
// INTERCARS -> within hour, AUTOPLUS -> same day, AUTO1 -> 2 days, else 3 days.
const STATUS_BY_SUPPLIER: Record<string, StockStatus> = {
  INTERCARS: StockStatus.DELIVERY_WITHIN_HOUR,
  AUTOPLUS: StockStatus.DELIVERY_SAME_DAY,
  AUTO1: StockStatus.DELIVERY_IN_2_DAYS,
};

const options: BestOfferOptions = { vatRate: 0.2 };

type SupplierSeed = Omit<SupplierOffer, 'delivery'>;

function withDelivery(seed: SupplierSeed): SupplierOffer {
  return {
    ...seed,
    delivery: outcomeForStatus(
      STATUS_BY_SUPPLIER[seed.supplierSource] ?? StockStatus.DELIVERY_IN_3_DAYS,
    ),
  };
}

function run(input: { own: BestOfferInput['own']; suppliers: SupplierSeed[] }) {
  return selectBestOffer(
    { own: input.own, suppliers: input.suppliers.map(withDelivery) },
    options,
  );
}

describe('selectBestOffer', () => {
  describe('own stock present', () => {
    it('locks the price to our sell price and ships immediately (IN_STOCK)', () => {
      const offer = run({
        own: { quantity: 4, priceExVatCents: 5000, priceIncVatCents: 6000 },
        suppliers: [],
      });

      expect(offer.available).toBe(true);
      expect(offer.stockStatus).toBe(StockStatus.IN_STOCK);
      expect(offer.estimatedDeliveryDays).toBe(0);
      expect(offer.quantity).toBe(4);
      expect(offer.priceExVatCents).toBe(5000);
      expect(offer.priceIncVatCents).toBe(6000);
      expect(offer.availabilityByDelivery).toEqual([
        {
          stockStatus: StockStatus.IN_STOCK,
          estimatedDeliveryDays: 0,
          quantity: 4,
          sources: [
            {
              supplierSource: null,
              warehouseCode: null,
              quantity: 4,
              buyPriceCents: null,
              sellPriceCents: 6000,
            },
          ],
        },
      ]);
    });

    it('keeps IN_STOCK as the fastest band over a within-hour supplier and keeps our price', () => {
      const offer = run({
        own: { quantity: 4, priceExVatCents: 5000, priceIncVatCents: 6000 },
        suppliers: [
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 3,
            buyPriceCents: 4000,
            sellPriceCents: 5200,
          },
        ],
      });

      // Our own stock (IN_STOCK) is faster than the supplier's within-hour band.
      expect(offer.stockStatus).toBe(StockStatus.IN_STOCK);
      expect(offer.estimatedDeliveryDays).toBe(0);
      expect(offer.quantity).toBe(4);
      expect(offer.priceExVatCents).toBe(5000);
      // Both windows are reported so the frontend can show "4 now, +3 within
      // the hour"; the headline mirrors the fastest (IN_STOCK) window.
      expect(offer.availabilityByDelivery).toEqual([
        {
          stockStatus: StockStatus.IN_STOCK,
          estimatedDeliveryDays: 0,
          quantity: 4,
          sources: [
            {
              supplierSource: null,
              warehouseCode: null,
              quantity: 4,
              buyPriceCents: null,
              sellPriceCents: 6000,
            },
          ],
        },
        {
          stockStatus: StockStatus.DELIVERY_WITHIN_HOUR,
          estimatedDeliveryDays: 0,
          quantity: 3,
          sources: [
            {
              supplierSource: 'INTERCARS',
              warehouseCode: 'B24',
              quantity: 3,
              buyPriceCents: 4000,
              sellPriceCents: 5200,
            },
          ],
        },
      ]);
    });

    it('falls through to the fastest supplier band when we hold zero units, keeping our price', () => {
      const offer = run({
        own: { quantity: 0, priceExVatCents: 5000, priceIncVatCents: 6000 },
        suppliers: [
          {
            supplierSource: 'AUTO1',
            warehouseCode: 'REGIONAL',
            quantity: 6,
            buyPriceCents: 3000,
            sellPriceCents: 4000,
          },
        ],
      });

      expect(offer.available).toBe(true);
      expect(offer.stockStatus).toBe(StockStatus.DELIVERY_IN_2_DAYS);
      expect(offer.estimatedDeliveryDays).toBe(2);
      expect(offer.quantity).toBe(6);
      expect(offer.priceExVatCents).toBe(5000);
      expect(offer.priceIncVatCents).toBe(6000);
      expect(offer.availabilityByDelivery).toEqual([
        {
          stockStatus: StockStatus.DELIVERY_IN_2_DAYS,
          estimatedDeliveryDays: 2,
          quantity: 6,
          sources: [
            {
              supplierSource: 'AUTO1',
              warehouseCode: 'REGIONAL',
              quantity: 6,
              buyPriceCents: 3000,
              sellPriceCents: 4000,
            },
          ],
        },
      ]);
    });

    it('raises the displayed price to the cheapest supplier when our price undercuts them', () => {
      const offer = run({
        own: { quantity: 4, priceExVatCents: 3000, priceIncVatCents: 3600 },
        suppliers: [
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 3,
            buyPriceCents: 3000,
            sellPriceCents: 4800,
          },
        ],
      });

      // We still ship from our own stock immediately, but we never undercut the
      // supplier: the headline price is bumped up to their (VAT-inclusive) one.
      expect(offer.stockStatus).toBe(StockStatus.IN_STOCK);
      expect(offer.quantity).toBe(4);
      expect(offer.priceIncVatCents).toBe(4800);
      expect(offer.priceExVatCents).toBe(Math.round(4800 / 1.2));
    });

    it('keeps our price when it equals the cheapest supplier price', () => {
      const offer = run({
        own: { quantity: 4, priceExVatCents: 4000, priceIncVatCents: 4800 },
        suppliers: [
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 3,
            buyPriceCents: 3000,
            sellPriceCents: 4800,
          },
        ],
      });

      expect(offer.priceExVatCents).toBe(4000);
      expect(offer.priceIncVatCents).toBe(4800);
    });

    it('uses the fastest supplier price as the reference, not the globally cheapest', () => {
      const offer = run({
        own: { quantity: 4, priceExVatCents: 3000, priceIncVatCents: 3600 },
        suppliers: [
          {
            supplierSource: 'INTERCARS', // within the hour
            warehouseCode: 'B24',
            quantity: 3,
            buyPriceCents: 3000,
            sellPriceCents: 5500,
          },
          {
            supplierSource: 'AUTO1', // 2 days, cheaper sell price but slower
            warehouseCode: 'REGIONAL',
            quantity: 6,
            buyPriceCents: 2500,
            sellPriceCents: 4200,
          },
        ],
      });

      // We would buy from the faster supplier (INTERCARS, within the hour), so
      // its sell price (5500) is the reference even though AUTO1 is cheaper.
      expect(offer.priceIncVatCents).toBe(5500);
      expect(offer.priceExVatCents).toBe(Math.round(5500 / 1.2));
    });

    it('breaks a delivery-band tie by the lowest buy price, then uses that supplier sell price', () => {
      const offer = run({
        own: { quantity: 4, priceExVatCents: 3000, priceIncVatCents: 3600 },
        suppliers: [
          {
            supplierSource: 'INTERCARS', // within the hour, higher buy price
            warehouseCode: 'B24',
            quantity: 3,
            buyPriceCents: 4000,
            sellPriceCents: 5300,
          },
          {
            supplierSource: 'INTERCARS', // within the hour, lower buy price
            warehouseCode: 'B24',
            quantity: 2,
            buyPriceCents: 3800,
            sellPriceCents: 5500,
          },
        ],
      });

      // Same delivery band -> we buy from the lower buy price (3800); its own
      // sell price (5500) becomes the reference, not the cheaper 5300 line.
      expect(offer.priceIncVatCents).toBe(5500);
      expect(offer.priceExVatCents).toBe(Math.round(5500 / 1.2));
    });

    it('ignores out-of-stock supplier lines when protecting our price', () => {
      const offer = run({
        own: { quantity: 4, priceExVatCents: 3000, priceIncVatCents: 3600 },
        suppliers: [
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 0, // no stock -> not a competing offer
            buyPriceCents: 1000,
            sellPriceCents: 2000,
          },
        ],
      });

      // The only supplier line has no stock, so we keep our own price.
      expect(offer.priceExVatCents).toBe(3000);
      expect(offer.priceIncVatCents).toBe(3600);
    });

    it('reports out of stock but keeps our price when nobody has stock', () => {
      const offer = run({
        own: { quantity: 0, priceExVatCents: 5000, priceIncVatCents: 6000 },
        suppliers: [],
      });

      expect(offer.available).toBe(false);
      expect(offer.stockStatus).toBe(StockStatus.OUT_OF_STOCK);
      expect(offer.estimatedDeliveryDays).toBeNull();
      expect(offer.quantity).toBe(0);
      expect(offer.priceExVatCents).toBe(5000);
      expect(offer.availabilityByDelivery).toEqual([]);
    });
  });

  describe('supplier-only fallback (we do not carry the part)', () => {
    it('combines quantity and picks the lowest buy price within the same band', () => {
      const offer = run({
        own: null,
        suppliers: [
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 3,
            buyPriceCents: 4000,
            sellPriceCents: 5500,
          },
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 2,
            buyPriceCents: 3800,
            sellPriceCents: 5300,
          },
        ],
      });

      expect(offer.stockStatus).toBe(StockStatus.DELIVERY_WITHIN_HOUR);
      expect(offer.quantity).toBe(5);
      // Lower buy price (3800) wins -> its VAT-inclusive sell price is shown,
      // and the ex-VAT figure is derived from it (no VAT added on top).
      expect(offer.priceIncVatCents).toBe(5300);
      expect(offer.priceExVatCents).toBe(Math.round(5300 / 1.2));
    });

    it('keeps each supplier quantity segregated and sorted cheapest-first', () => {
      const offer = run({
        own: null,
        suppliers: [
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 3,
            buyPriceCents: 4000,
            sellPriceCents: 5500,
          },
          {
            supplierSource: 'AUTOPLUS', // same-day band... slower, excluded below
            warehouseCode: 'CENTRALEN_SKLAD',
            quantity: 10,
            buyPriceCents: 100,
            sellPriceCents: 200,
          },
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 4,
            buyPriceCents: 3800,
            sellPriceCents: 5300,
          },
        ],
      });

      // Fastest band is within-hour (both INTERCARS lines); the cheaper AUTOPLUS
      // offer is in its own (slower) same-day band and must not bleed into it.
      expect(offer.stockStatus).toBe(StockStatus.DELIVERY_WITHIN_HOUR);
      expect(offer.quantity).toBe(7);
      expect(offer.availabilityByDelivery).toEqual([
        {
          stockStatus: StockStatus.DELIVERY_WITHIN_HOUR,
          estimatedDeliveryDays: 0,
          quantity: 7,
          sources: [
            {
              supplierSource: 'INTERCARS',
              warehouseCode: 'B24',
              quantity: 4,
              buyPriceCents: 3800,
              sellPriceCents: 5300,
            },
            {
              supplierSource: 'INTERCARS',
              warehouseCode: 'B24',
              quantity: 3,
              buyPriceCents: 4000,
              sellPriceCents: 5500,
            },
          ],
        },
        {
          stockStatus: StockStatus.DELIVERY_SAME_DAY,
          estimatedDeliveryDays: 0,
          quantity: 10,
          sources: [
            {
              supplierSource: 'AUTOPLUS',
              warehouseCode: 'CENTRALEN_SKLAD',
              quantity: 10,
              buyPriceCents: 100,
              sellPriceCents: 200,
            },
          ],
        },
      ]);
    });

    it('prefers a faster band even if a slower supplier is cheaper', () => {
      const offer = run({
        own: null,
        suppliers: [
          {
            supplierSource: 'INTERCARS', // within hour
            warehouseCode: 'B24',
            quantity: 1,
            buyPriceCents: 5000,
            sellPriceCents: 7000,
          },
          {
            supplierSource: 'AUTO1', // 2 days, cheaper
            warehouseCode: 'REGIONAL',
            quantity: 9,
            buyPriceCents: 3000,
            sellPriceCents: 4000,
          },
        ],
      });

      expect(offer.stockStatus).toBe(StockStatus.DELIVERY_WITHIN_HOUR);
      expect(offer.quantity).toBe(1);
      expect(offer.priceIncVatCents).toBe(7000);
      expect(offer.priceExVatCents).toBe(Math.round(7000 / 1.2));
    });

    it('ignores supplier rows with zero quantity', () => {
      const offer = run({
        own: null,
        suppliers: [
          {
            supplierSource: 'INTERCARS',
            warehouseCode: 'B24',
            quantity: 0,
            buyPriceCents: 1000,
            sellPriceCents: 2000,
          },
          {
            supplierSource: 'AUTO1',
            warehouseCode: 'REGIONAL',
            quantity: 4,
            buyPriceCents: 3000,
            sellPriceCents: 4000,
          },
        ],
      });

      expect(offer.stockStatus).toBe(StockStatus.DELIVERY_IN_2_DAYS);
      expect(offer.quantity).toBe(4);
      expect(offer.priceIncVatCents).toBe(4000);
      expect(offer.priceExVatCents).toBe(Math.round(4000 / 1.2));
    });

    it('returns an unavailable offer with null prices when no supplier has stock', () => {
      const offer = run({ own: null, suppliers: [] });

      expect(offer.available).toBe(false);
      expect(offer.stockStatus).toBe(StockStatus.OUT_OF_STOCK);
      expect(offer.estimatedDeliveryDays).toBeNull();
      expect(offer.quantity).toBe(0);
      expect(offer.priceExVatCents).toBeNull();
      expect(offer.priceIncVatCents).toBeNull();
      expect(offer.availabilityByDelivery).toEqual([]);
    });
  });
});
