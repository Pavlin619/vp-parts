import {
  fromShippingColumns,
  isFullyMeasured,
  preferMeasured,
  toShippingColumns,
} from './cart-shipping';

const BOX = { length: 12, width: 7.5, height: 7.5 };
const NOTHING = { weightGrams: null, packageCm: null };

describe('isFullyMeasured', () => {
  it('needs both the weight and the box', () => {
    expect(isFullyMeasured({ weightGrams: 68, packageCm: BOX })).toBe(true);
    expect(isFullyMeasured({ weightGrams: 68, packageCm: null })).toBe(false);
    expect(isFullyMeasured({ weightGrams: null, packageCm: BOX })).toBe(false);
  });
});

describe('preferMeasured', () => {
  it('keeps the preferred profile when it is complete', () => {
    const preferred = { weightGrams: 68, packageCm: BOX };
    const fallback = {
      weightGrams: 50,
      packageCm: { length: 1, width: 1, height: 1 },
    };

    expect(preferMeasured(preferred, fallback)).toEqual(preferred);
  });

  it('fills each missing half from the fallback', () => {
    expect(
      preferMeasured(
        { weightGrams: 68, packageCm: null },
        { weightGrams: 50, packageCm: BOX },
      ),
    ).toEqual({ weightGrams: 68, packageCm: BOX });
  });

  it('stays unknown when neither source knows', () => {
    expect(preferMeasured(NOTHING, NOTHING)).toEqual(NOTHING);
  });
});

describe('toShippingColumns', () => {
  it('spreads a boxed profile across the four columns', () => {
    const columns = toShippingColumns({
      weightGrams: 47,
      packageCm: { length: 12, width: 7.5, height: 7.5 },
    });

    expect(columns).toEqual({
      weightGrams: 47,
      packageLengthCm: 12,
      packageWidthCm: 7.5,
      packageHeightCm: 7.5,
    });
  });

  it('stores null for whatever TecDoc does not file', () => {
    const columns = toShippingColumns({ weightGrams: null, packageCm: null });

    expect(columns).toEqual({
      weightGrams: null,
      packageLengthCm: null,
      packageWidthCm: null,
      packageHeightCm: null,
    });
  });
});

describe('fromShippingColumns', () => {
  it('rebuilds the profile it was stored from', () => {
    const profile = {
      weightGrams: 2000,
      packageCm: { length: 30, width: 20, height: 10 },
    };

    expect(fromShippingColumns(toShippingColumns(profile))).toEqual(profile);
  });

  it('keeps a weight without a box', () => {
    const profile = fromShippingColumns({
      weightGrams: 2000,
      packageLengthCm: null,
      packageWidthCm: null,
      packageHeightCm: null,
    });

    expect(profile).toEqual({ weightGrams: 2000, packageCm: null });
  });

  it('reads a box missing any side as no box at all', () => {
    const profile = fromShippingColumns({
      weightGrams: null,
      packageLengthCm: 30,
      packageWidthCm: 20,
      packageHeightCm: null,
    });

    expect(profile.packageCm).toBeNull();
  });
});
