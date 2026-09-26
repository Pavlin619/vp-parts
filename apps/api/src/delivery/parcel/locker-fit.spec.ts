import { fitsLocker, LockerLimits } from './locker-fit';

const LIMITS: LockerLimits = {
  maxSidesCm: [61, 44, 37],
  maxWeightGrams: 20_000,
  fillFactor: 0.8,
};

const filter = { length: 7.5, width: 7.5, height: 12 };

describe('fitsLocker', () => {
  it('accepts a small parcel', () => {
    expect(
      fitsLocker({ unitsCm: [filter, filter], weightGrams: 200 }, LIMITS),
    ).toBe(true);
  });

  it('turns an item to fit, comparing sides longest to longest', () => {
    const item = { length: 30, width: 60, height: 40 };

    expect(fitsLocker({ unitsCm: [item], weightGrams: 1000 }, LIMITS)).toBe(
      true,
    );
  });

  it('refuses an item with one side longer than the cell allows', () => {
    const exhaust = { length: 120, width: 20, height: 20 };

    expect(fitsLocker({ unitsCm: [exhaust], weightGrams: 1000 }, LIMITS)).toBe(
      false,
    );
  });

  it('refuses items that fit one by one but not together', () => {
    const box = { length: 40, width: 40, height: 30 };

    expect(fitsLocker({ unitsCm: [box, box], weightGrams: 1000 }, LIMITS)).toBe(
      false,
    );
  });

  it('refuses a parcel over the weight limit', () => {
    expect(fitsLocker({ unitsCm: [filter], weightGrams: 20_001 }, LIMITS)).toBe(
      false,
    );
  });

  it('refuses a parcel whose boxes are not all known', () => {
    expect(fitsLocker({ unitsCm: null, weightGrams: 200 }, LIMITS)).toBe(false);
  });

  it('refuses an empty parcel', () => {
    expect(fitsLocker({ unitsCm: [], weightGrams: 0 }, LIMITS)).toBe(false);
  });
});
