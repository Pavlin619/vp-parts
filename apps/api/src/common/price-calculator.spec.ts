import { PriceCalculator } from './price-calculator';

describe('PriceCalculator', () => {
  const VAT_RATE = 0.2;
  let calculator: PriceCalculator;

  beforeEach(() => {
    calculator = new PriceCalculator(VAT_RATE);
  });

  describe('lineTotal', () => {
    it('returns unit price for quantity 1', () => {
      expect(calculator.lineTotal(100, 1)).toBe(100);
    });

    it('multiplies unit price by quantity', () => {
      expect(calculator.lineTotal(250, 3)).toBe(750);
    });

    it('handles 1 cent unit price', () => {
      expect(calculator.lineTotal(1, 5)).toBe(5);
    });

    it('handles 999 cent unit price', () => {
      expect(calculator.lineTotal(999, 2)).toBe(1998);
    });

    it('returns 0 for zero quantity', () => {
      expect(calculator.lineTotal(500, 0)).toBe(0);
    });
  });

  describe('subtotal', () => {
    it('sums multiple line totals', () => {
      const lines = [
        { unitPriceCents: 100, quantity: 2 },
        { unitPriceCents: 250, quantity: 3 },
      ];
      expect(calculator.subtotal(lines)).toBe(200 + 750);
    });

    it('returns 0 for empty cart', () => {
      expect(calculator.subtotal([])).toBe(0);
    });

    it('handles single item', () => {
      expect(calculator.subtotal([{ unitPriceCents: 999, quantity: 1 }])).toBe(
        999,
      );
    });

    it('aggregates multi-item cart correctly', () => {
      const lines = [
        { unitPriceCents: 1, quantity: 100 },
        { unitPriceCents: 500, quantity: 2 },
        { unitPriceCents: 333, quantity: 3 },
      ];
      expect(calculator.subtotal(lines)).toBe(100 + 1000 + 999);
    });
  });

  describe('vatAmount', () => {
    it('applies Math.round exactly once', () => {
      // 100 * 0.2 = 20 exactly — no rounding needed
      expect(calculator.vatAmount(100)).toBe(20);
    });

    it('rounds 0.5 up', () => {
      // 3 * 0.2 = 0.6 → rounds to 1
      expect(calculator.vatAmount(3)).toBe(1);
    });

    it('rounds fractional result correctly for 1 cent subtotal', () => {
      // 1 * 0.2 = 0.2 → rounds to 0
      expect(calculator.vatAmount(1)).toBe(0);
    });

    it('rounds fractional result correctly for 999 cent subtotal', () => {
      // 999 * 0.2 = 199.8 → rounds to 200
      expect(calculator.vatAmount(999)).toBe(200);
    });

    it('handles large subtotals', () => {
      // 10000 * 0.2 = 2000
      expect(calculator.vatAmount(10000)).toBe(2000);
    });

    it('rounds half-cent edge case (5 cents at 20% = 1.0)', () => {
      // 5 * 0.2 = 1.0 → 1
      expect(calculator.vatAmount(5)).toBe(1);
    });
  });

  describe('orderTotal', () => {
    it('sums subtotal and vatAmount', () => {
      const lines = [{ unitPriceCents: 100, quantity: 2 }];
      const sub = calculator.subtotal(lines); // 200
      const vat = calculator.vatAmount(sub); // 40
      expect(calculator.orderTotal(lines)).toBe(sub + vat);
    });

    it('returns 0 for empty cart', () => {
      expect(calculator.orderTotal([])).toBe(0);
    });

    it('handles 1-cent item', () => {
      const lines = [{ unitPriceCents: 1, quantity: 1 }];
      // subtotal = 1, vat = round(0.2) = 0, total = 1
      expect(calculator.orderTotal(lines)).toBe(1);
    });

    it('handles 999-cent item', () => {
      const lines = [{ unitPriceCents: 999, quantity: 1 }];
      // subtotal = 999, vat = round(199.8) = 200, total = 1199
      expect(calculator.orderTotal(lines)).toBe(1199);
    });

    it('aggregates multi-item cart total correctly', () => {
      const lines = [
        { unitPriceCents: 500, quantity: 2 },
        { unitPriceCents: 300, quantity: 3 },
      ];
      // subtotal = 1000 + 900 = 1900, vat = round(380) = 380, total = 2280
      expect(calculator.orderTotal(lines)).toBe(2280);
    });
  });
});
