import type { ShippingProfile } from '../../tecdoc';
import { estimateFromEquivalents } from './equivalents-estimate';

function weighing(grams: number): ShippingProfile {
  return { weightGrams: grams, packageCm: null };
}

describe('estimateFromEquivalents', () => {
  it('takes the median weight of the equivalents', () => {
    const estimate = estimateFromEquivalents([
      weighing(1200),
      weighing(1300),
      weighing(1500),
      weighing(1400),
    ]);

    expect(estimate).toEqual({ weightGrams: 1350, packageCm: null });
  });

  it('takes a single weighed equivalent as it is', () => {
    expect(estimateFromEquivalents([weighing(1200)])).toEqual({
      weightGrams: 1200,
      packageCm: null,
    });
  });

  it('is unknown when no equivalent carries a weight', () => {
    expect(estimateFromEquivalents([])).toBeNull();
    expect(
      estimateFromEquivalents([
        { weightGrams: null, packageCm: { length: 9, width: 9, height: 9 } },
      ]),
    ).toBeNull();
  });

  it('ignores equivalents without a weight', () => {
    const estimate = estimateFromEquivalents([
      weighing(1200),
      { weightGrams: null, packageCm: { length: 9, width: 9, height: 9 } },
    ]);

    expect(estimate).toEqual({ weightGrams: 1200, packageCm: null });
  });

  it('rounds a fractional median up to a whole gram', () => {
    const estimate = estimateFromEquivalents([weighing(1201), weighing(1202)]);

    expect(estimate?.weightGrams).toBe(1202);
  });

  // Brake-disc singles and two-disc packs: the singles are the majority, so the
  // median lands on one disc without knowing what the part is.
  it('is not pulled by a minority of multi-packs', () => {
    const estimate = estimateFromEquivalents(
      [6680, 6700, 6720, 6750, 12_500, 13_360].map(weighing),
    );

    expect(estimate?.weightGrams).toBe(6735);
  });

  it('takes the median of each side, longest first, across equivalents with a full box', () => {
    const estimate = estimateFromEquivalents([
      { weightGrams: 1200, packageCm: { length: 30, width: 20, height: 10 } },
      { weightGrams: 1300, packageCm: { length: 12, width: 34, height: 22 } },
      { weightGrams: 1400, packageCm: { length: 26, width: 18, height: 40 } },
      { weightGrams: 1500, packageCm: null },
    ]);

    expect(estimate?.packageCm).toEqual({ length: 34, width: 22, height: 12 });
  });
});
