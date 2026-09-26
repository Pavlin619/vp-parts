import { estimateParcel, ParcelLine, singleBoxOf } from './parcel-estimate';

const knownFilter: ParcelLine = {
  article: { brandId: '34', articleNumber: 'OX 389/1D' },
  quantity: 1,
  shippingProfile: {
    weightGrams: 47,
    packageCm: { length: 7.5, width: 7.5, height: 12 },
  },
};

const unmeasuredDisc: ParcelLine = {
  article: { brandId: '30', articleNumber: '0 986 479 C84' },
  quantity: 2,
  shippingProfile: { weightGrams: null, packageCm: null },
};

describe('estimateParcel', () => {
  it('weighs lines by their own data, times quantity', () => {
    const estimate = estimateParcel([{ ...knownFilter, quantity: 3 }]);

    expect(estimate.isMeasured && estimate.parcel.weightGrams).toBe(47 * 3);
  });

  it('refuses to guess a weight, naming every part that has none', () => {
    const otherUnmeasured: ParcelLine = {
      ...unmeasuredDisc,
      article: { brandId: '30', articleNumber: '0 986 479 C85' },
    };

    expect(
      estimateParcel([knownFilter, unmeasuredDisc, otherUnmeasured]),
    ).toEqual({
      isMeasured: false,
      unmeasuredArticles: [unmeasuredDisc.article, otherUnmeasured.article],
    });
  });

  it('weighs a part with a weight but no box, which an office takes', () => {
    const weighedButUnboxed: ParcelLine = {
      ...knownFilter,
      shippingProfile: { weightGrams: 47, packageCm: null },
    };

    expect(estimateParcel([weighedButUnboxed])).toEqual({
      isMeasured: true,
      parcel: { weightGrams: 47, unitsCm: null },
    });
  });

  it('lists the box of every piece, one per unit of quantity', () => {
    const box = knownFilter.shippingProfile.packageCm;
    const estimate = estimateParcel([{ ...knownFilter, quantity: 2 }]);

    expect(estimate.isMeasured && estimate.parcel.unitsCm).toEqual([box, box]);
  });

  it('knows no boxes when any line has no package size', () => {
    const weighedButUnboxed: ParcelLine = {
      ...knownFilter,
      shippingProfile: { weightGrams: 47, packageCm: null },
    };
    const estimate = estimateParcel([knownFilter, weighedButUnboxed]);

    expect(estimate.isMeasured && estimate.parcel.unitsCm).toBeNull();
  });
});

describe('singleBoxOf', () => {
  const box = { length: 30, width: 20, height: 10 };

  it('gives the box of a parcel that is a single unit, where it is exact', () => {
    expect(singleBoxOf({ weightGrams: 47, unitsCm: [box] })).toEqual(box);
  });

  it('gives no box for several units, whose packing is unknown', () => {
    expect(singleBoxOf({ weightGrams: 94, unitsCm: [box, box] })).toBeNull();
  });

  it('gives no box when the unit sizes are unknown', () => {
    expect(singleBoxOf({ weightGrams: 47, unitsCm: null })).toBeNull();
  });
});
