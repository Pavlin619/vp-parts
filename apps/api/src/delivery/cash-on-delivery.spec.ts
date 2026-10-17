import { amountToCollectCents } from './cash-on-delivery';

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
