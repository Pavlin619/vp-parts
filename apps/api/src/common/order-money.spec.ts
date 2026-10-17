import { orderMoney } from './order-money';

const VAT_RATE = 0.2;

describe('orderMoney', () => {
  it('splits the documented example into its parts, total, net and VAT', () => {
    const money = orderMoney(
      {
        lines: [
          { unitPrice: 1299, quantity: 2 },
          { unitPrice: 749, quantity: 3 },
        ],
        deliveryPrice: 378,
        cashOnDeliveryFee: 81,
      },
      VAT_RATE,
    );

    expect(money).toEqual({
      goodsTotal: 4845,
      deliveryPrice: 378,
      cashOnDeliveryFee: 81,
      total: 5304,
      netAmount: 4420,
      vatAmount: 884,
    });
  });

  it('keeps all of a 1-cent total as net, with no VAT', () => {
    const money = orderMoney(
      {
        lines: [{ unitPrice: 1, quantity: 1 }],
        deliveryPrice: 0,
        cashOnDeliveryFee: 0,
      },
      VAT_RATE,
    );

    expect(money).toMatchObject({ total: 1, netAmount: 1, vatAmount: 0 });
  });

  it.each([
    [3, 3, 0],
    [9, 8, 1],
    [15, 13, 2],
    [21, 18, 3],
  ])(
    'rounds a net of exactly half a cent up (total %i)',
    (total, netAmount, vatAmount) => {
      const money = orderMoney(
        {
          lines: [{ unitPrice: total, quantity: 1 }],
          deliveryPrice: 0,
          cashOnDeliveryFee: 0,
        },
        VAT_RATE,
      );

      expect(money).toMatchObject({ total, netAmount, vatAmount });
    },
  );

  it('works the VAT out of the total once, where per-line rounding would differ', () => {
    const lines = [101, 101, 101, 101].map((unitPrice) => ({
      unitPrice,
      quantity: 1,
    }));
    const perLineVat = lines.length * (101 - Math.round(101 / (1 + VAT_RATE)));

    const money = orderMoney(
      { lines, deliveryPrice: 0, cashOnDeliveryFee: 0 },
      VAT_RATE,
    );

    expect(perLineVat).toBe(68);
    expect(money).toMatchObject({ total: 404, netAmount: 337, vatAmount: 67 });
  });

  it('takes the VAT out of the delivery and the fee as well as the parts', () => {
    const money = orderMoney(
      { lines: [], deliveryPrice: 378, cashOnDeliveryFee: 0 },
      VAT_RATE,
    );

    expect(money).toMatchObject({
      goodsTotal: 0,
      total: 378,
      netAmount: 315,
      vatAmount: 63,
    });
  });

  it('answers zero for an order with nothing in it', () => {
    const money = orderMoney(
      { lines: [], deliveryPrice: 0, cashOnDeliveryFee: 0 },
      VAT_RATE,
    );

    expect(money).toEqual({
      goodsTotal: 0,
      deliveryPrice: 0,
      cashOnDeliveryFee: 0,
      total: 0,
      netAmount: 0,
      vatAmount: 0,
    });
  });

  it('leaves the whole total as net at a zero rate', () => {
    const money = orderMoney(
      {
        lines: [{ unitPrice: 999, quantity: 3 }],
        deliveryPrice: 0,
        cashOnDeliveryFee: 0,
      },
      0,
    );

    expect(money).toMatchObject({ total: 2997, netAmount: 2997, vatAmount: 0 });
  });

  it('always totals the exact sum of the gross lines, delivery and fee', () => {
    const unitPrices = [1, 7, 99, 101, 749, 1299, 4999, 123457];

    for (const unitPrice of unitPrices) {
      for (const quantity of [1, 2, 3, 99]) {
        const lines = [
          { unitPrice, quantity },
          { unitPrice: unitPrice + 1, quantity: 1 },
        ];

        const money = orderMoney(
          { lines, deliveryPrice: 378, cashOnDeliveryFee: 81 },
          VAT_RATE,
        );

        const goodsTotal = unitPrice * quantity + unitPrice + 1;
        expect(money.goodsTotal).toBe(goodsTotal);
        expect(money.total).toBe(goodsTotal + 378 + 81);
        expect(money.netAmount + money.vatAmount).toBe(money.total);
      }
    }
  });
});
