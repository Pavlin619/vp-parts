import { ArticleInventoryDetailDto } from '@vp-parts-shop/shared';
import { ArticleUnavailableException } from '../inventory';
import type { AvailabilityByArticle } from '../inventory';
import {
  amountToCollectCents,
  goodsTotalIncVatCents,
} from './cash-on-delivery';

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

describe('goodsTotalIncVatCents', () => {
  let availability: AvailabilityByArticle;

  beforeEach(() => {
    availability = new Map([
      ['30:FILTER', stocked(5, 1250)],
      ['30:PAD', stocked(5, 4800)],
    ]);
  });

  it('sums every line at its live gross price', () => {
    const total = goodsTotalIncVatCents(
      [lineOf('FILTER', 2), lineOf('PAD', 1)],
      availability,
    );

    expect(total).toBe(2 * 1250 + 4800);
  });

  it('refuses a line the read has no row for', () => {
    expect(() =>
      goodsTotalIncVatCents([lineOf('MISSING', 1)], availability),
    ).toThrow(ArticleUnavailableException);
  });

  it('refuses a line with no price, which no order can collect for', () => {
    availability.set('30:FILTER', stocked(5, null));

    expect(() =>
      goodsTotalIncVatCents([lineOf('FILTER', 1)], availability),
    ).toThrow(ArticleUnavailableException);
  });

  it('refuses a part that is out of stock', () => {
    availability.set('30:FILTER', { ...stocked(0, 1250), available: false });

    expect(() =>
      goodsTotalIncVatCents([lineOf('FILTER', 1)], availability),
    ).toThrow(ArticleUnavailableException);
  });

  it('refuses a line asking for more pieces than are held', () => {
    expect(() =>
      goodsTotalIncVatCents([lineOf('PAD', 6)], availability),
    ).toThrow(ArticleUnavailableException);
  });
});

describe('amountToCollectCents', () => {
  it('collects the parts, the delivery and the fee the courier charged', () => {
    const amount = amountToCollectCents(10000, {
      priceIncVatCents: 378,
      cashOnDeliveryFeeIncVatCents: 152,
      expectedDeliveryDate: null,
    });

    expect(amount).toBe(10000 + 378 + 152);
  });

  it('collects no fee when the courier priced none', () => {
    const amount = amountToCollectCents(10000, {
      priceIncVatCents: 378,
      cashOnDeliveryFeeIncVatCents: null,
      expectedDeliveryDate: null,
    });

    expect(amount).toBe(10378);
  });
});
