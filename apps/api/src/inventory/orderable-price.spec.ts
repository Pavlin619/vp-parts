import { ArticleInventoryDetailDto } from '@vp-parts-shop/shared';
import { ArticleUnavailableException } from './article-unavailable.exception';
import type { AvailabilityByArticle } from './inventory.service';
import {
  orderableUnitPrice,
  priceLines,
  requirePricedLines,
} from './orderable-price';

function stocked(
  quantity: number,
  bestPriceIncVat: number | null,
): ArticleInventoryDetailDto {
  return {
    available: true,
    bestPriceExVat: bestPriceIncVat,
    bestPriceIncVat,
    availabilityByWarehouse: [
      {
        warehouseId: 'CENTRAL',
        quantity,
        deliveryWorkDays: 0,
        orderCutoffTime: '17:00',
        cutoffAt: '2026-10-15T14:00:00Z',
        pickup: { earliestAt: '2026-10-15T08:00:00Z', granularity: 'HOUR' },
        courier: { earliestAt: '2026-10-16T08:00:00Z', granularity: 'DAY' },
      },
    ],
    computedAt: '2026-10-15T07:00:00Z',
  };
}

function lineOf(articleNumber: string, quantity: number) {
  return { article: { brandId: '30', articleNumber }, quantity };
}

describe('orderableUnitPrice', () => {
  let availability: AvailabilityByArticle;

  beforeEach(() => {
    availability = new Map([['30:FILTER', stocked(5, 1250)]]);
  });

  it('is the live gross unit price of a line the stock covers', () => {
    expect(orderableUnitPrice(lineOf('FILTER', 5), availability)).toBe(1250);
  });

  it('is null for a line the read has no row for', () => {
    expect(orderableUnitPrice(lineOf('MISSING', 1), availability)).toBeNull();
  });

  it('is null for a part with no price', () => {
    availability.set('30:FILTER', stocked(5, null));

    expect(orderableUnitPrice(lineOf('FILTER', 1), availability)).toBeNull();
  });

  it('is null for a part out of stock, even one still priced', () => {
    availability.set('30:FILTER', { ...stocked(5, 1250), available: false });

    expect(orderableUnitPrice(lineOf('FILTER', 1), availability)).toBeNull();
  });

  it('is null for a line asking for more pieces than are held', () => {
    expect(orderableUnitPrice(lineOf('FILTER', 6), availability)).toBeNull();
  });

  it('counts the pieces across every warehouse', () => {
    const detail = stocked(2, 1250);
    availability.set('30:FILTER', {
      ...detail,
      availabilityByWarehouse: [
        ...detail.availabilityByWarehouse,
        { ...detail.availabilityByWarehouse[0], warehouseId: 'REGIONAL_2' },
      ],
    });

    expect(orderableUnitPrice(lineOf('FILTER', 4), availability)).toBe(1250);
  });
});

describe('priceLines', () => {
  const availability: AvailabilityByArticle = new Map([
    ['30:FILTER', stocked(5, 1250)],
    ['30:PAD', stocked(1, 4800)],
  ]);

  it('prices each orderable line, keeping what the line carried', () => {
    const line = { ...lineOf('FILTER', 2), brandName: 'BOSCH' };

    expect(priceLines([line], availability)).toEqual({
      priced: [{ ...line, unitPrice: 1250 }],
      unorderable: [],
    });
  });

  it('sets apart the lines no order could include', () => {
    const { priced, unorderable } = priceLines(
      [lineOf('FILTER', 1), lineOf('PAD', 2), lineOf('MISSING', 1)],
      availability,
    );

    expect(priced.map((line) => line.article.articleNumber)).toEqual([
      'FILTER',
    ]);
    expect(unorderable.map((line) => line.article.articleNumber)).toEqual([
      'PAD',
      'MISSING',
    ]);
  });
});

describe('requirePricedLines', () => {
  const availability: AvailabilityByArticle = new Map([
    ['30:FILTER', stocked(5, 1250)],
    ['30:PAD', stocked(5, 4800)],
  ]);

  it('prices every line when all can be ordered', () => {
    const priced = requirePricedLines(
      [lineOf('FILTER', 2), lineOf('PAD', 1)],
      availability,
    );

    expect(priced.map((line) => line.unitPrice)).toEqual([1250, 4800]);
  });

  it('refuses the lot when any one line cannot be ordered', () => {
    expect(() =>
      requirePricedLines(
        [lineOf('FILTER', 1), lineOf('FILTER', 6)],
        availability,
      ),
    ).toThrow(ArticleUnavailableException);
  });
});
