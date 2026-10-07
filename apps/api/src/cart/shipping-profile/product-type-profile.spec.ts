import type { PackageSizeCm, ShippingProfile } from '../../tecdoc';
import { aggregateProductTypeProfile } from './product-type-profile';

const sample = (
  weightGrams: number | null,
  packageCm: PackageSizeCm | null = null,
): ShippingProfile => ({ weightGrams, packageCm });

describe('aggregateProductTypeProfile', () => {
  it('is null when no sample has a weight', () => {
    expect(aggregateProductTypeProfile([])).toBeNull();
    expect(aggregateProductTypeProfile([sample(null)])).toBeNull();
  });

  it('accepts a single weighed sample', () => {
    expect(aggregateProductTypeProfile([sample(450)])).toEqual({
      weightGrams: 450,
      packageCm: null,
      sampleSize: 1,
    });
  });

  it('ignores samples without a weight when counting', () => {
    const profile = aggregateProductTypeProfile([
      sample(null),
      sample(200),
      sample(400),
    ]);

    expect(profile).toMatchObject({ weightGrams: 300, sampleSize: 2 });
  });

  it('takes the median of a narrow type', () => {
    const profile = aggregateProductTypeProfile(
      [300, 320, 340, 360, 380].map((grams) => sample(grams)),
    );

    expect(profile?.weightGrams).toBe(340);
  });

  it('takes the p75 of a wide type so the quote errs high', () => {
    const profile = aggregateProductTypeProfile(
      [1000, 1000, 5000, 6000].map((grams) => sample(grams)),
    );

    expect(profile?.weightGrams).toBe(5250);
  });

  it('keeps the median below four samples however wide the spread', () => {
    const profile = aggregateProductTypeProfile(
      [1000, 1500, 9000].map((grams) => sample(grams)),
    );

    expect(profile?.weightGrams).toBe(1500);
  });

  it('is not wide when the p75/p25 ratio is exactly 2', () => {
    const profile = aggregateProductTypeProfile(
      [1000, 1000, 2000, 2000].map((grams) => sample(grams)),
    );

    expect(profile?.weightGrams).toBe(1500);
  });

  it('takes the median of each sorted box side', () => {
    const profile = aggregateProductTypeProfile([
      sample(100, { length: 10, width: 20, height: 5 }),
      sample(100, { length: 8, width: 4, height: 18 }),
      sample(100, { length: 30, width: 12, height: 6 }),
    ]);

    expect(profile?.packageCm).toEqual({ length: 20, width: 10, height: 5 });
  });

  it('measures the box only over samples that have a full one', () => {
    const profile = aggregateProductTypeProfile([
      sample(100),
      sample(100, { length: 10, width: 5, height: 2 }),
    ]);

    expect(profile?.packageCm).toEqual({ length: 10, width: 5, height: 2 });
  });

  it('has no box when no sample has one', () => {
    expect(
      aggregateProductTypeProfile([sample(100), sample(200)])?.packageCm,
    ).toBeNull();
  });
});
