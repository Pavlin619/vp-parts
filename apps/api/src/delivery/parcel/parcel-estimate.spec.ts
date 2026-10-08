import { estimateParcel, ParcelLine, singleBoxOf } from './parcel-estimate';

const knownFilter: ParcelLine = {
  article: { brandId: '34', articleNumber: 'OX 389/1D' },
  quantity: 1,
  shippingProfile: {
    weightGrams: 47,
    packageCm: { length: 7.5, width: 7.5, height: 12 },
    isEstimated: false,
  },
};

describe('estimateParcel', () => {
  it('weighs lines by their own data, times quantity', () => {
    const estimate = estimateParcel([{ ...knownFilter, quantity: 3 }]);

    expect(estimate.weightGrams).toBe(47 * 3);
  });

  it('weighs a part with a weight but no box, which an office takes', () => {
    const weighedButUnboxed: ParcelLine = {
      ...knownFilter,
      shippingProfile: { weightGrams: 47, packageCm: null, isEstimated: false },
    };

    expect(estimateParcel([weighedButUnboxed])).toEqual({
      weightGrams: 47,
      unitsCm: null,
      hasEstimatedUnits: false,
    });
  });

  it('marks a parcel holding any estimated line', () => {
    const estimatedFilter: ParcelLine = {
      ...knownFilter,
      shippingProfile: { ...knownFilter.shippingProfile, isEstimated: true },
    };

    const estimate = estimateParcel([knownFilter, estimatedFilter]);

    expect(estimate.hasEstimatedUnits).toBe(true);
  });

  it('lists the box of every piece, one per unit of quantity', () => {
    const box = knownFilter.shippingProfile.packageCm;
    const estimate = estimateParcel([{ ...knownFilter, quantity: 2 }]);

    expect(estimate.unitsCm).toEqual([box, box]);
  });

  it('knows no boxes when any line has no package size', () => {
    const weighedButUnboxed: ParcelLine = {
      ...knownFilter,
      shippingProfile: { weightGrams: 47, packageCm: null, isEstimated: false },
    };
    const estimate = estimateParcel([knownFilter, weighedButUnboxed]);

    expect(estimate.unitsCm).toBeNull();
  });
});

describe('singleBoxOf', () => {
  const box = { length: 30, width: 20, height: 10 };
  const MEASURED = { hasEstimatedUnits: false };

  it('gives the box of a parcel that is a single unit, where it is exact', () => {
    expect(
      singleBoxOf({ ...MEASURED, weightGrams: 47, unitsCm: [box] }),
    ).toEqual(box);
  });

  it('gives no box for several units, whose packing is unknown', () => {
    expect(
      singleBoxOf({ ...MEASURED, weightGrams: 94, unitsCm: [box, box] }),
    ).toBeNull();
  });

  it('gives no box when the unit sizes are unknown', () => {
    expect(
      singleBoxOf({ ...MEASURED, weightGrams: 47, unitsCm: null }),
    ).toBeNull();
  });
});
