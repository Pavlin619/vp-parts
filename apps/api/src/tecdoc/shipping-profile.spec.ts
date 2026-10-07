import { shippingProfileOf } from './shipping-profile';
import type { TecDocArticleRecord } from './article-mapper';

function articleWith(
  criteria: Array<{ criteriaId: number; rawValue: string }>,
): TecDocArticleRecord {
  return {
    articleNumber: 'OX 389/1D',
    dataSupplierId: 30,
    mfrName: 'KNECHT',
    articleCriteria: criteria.map((criterion) => ({
      ...criterion,
      criteriaDescription: 'irrelevant',
      formattedValue: 'irrelevant',
    })),
  };
}

describe('shippingProfileOf', () => {
  it('reads a net weight in grams and a full package size in centimetres', () => {
    const profile = shippingProfileOf(
      articleWith([
        { criteriaId: 3852, rawValue: '47' },
        { criteriaId: 1620, rawValue: '7,5' },
        { criteriaId: 1621, rawValue: '7,50' },
        { criteriaId: 1622, rawValue: '12,00' },
      ]),
    );

    expect(profile).toEqual({
      weightGrams: 47,
      packageCm: { length: 7.5, width: 7.5, height: 12 },
    });
  });

  it.each([
    [212, '1,25', 1250],
    [2612, '8', 8000],
    [683, '650', 650],
    [3852, '1250', 1250],
    [212, '0.109', 109],
  ])(
    'converts weight criterion %i (raw "%s") to %i grams',
    (criteriaId, rawValue, grams) => {
      expect(
        shippingProfileOf(articleWith([{ criteriaId, rawValue }])).weightGrams,
      ).toBe(grams);
    },
  );

  it('reads the raw value, never the display string', () => {
    const article = articleWith([{ criteriaId: 3852, rawValue: '1250' }]);
    article.articleCriteria![0].formattedValue = '1 250 грам';

    expect(shippingProfileOf(article).weightGrams).toBe(1250);
  });

  it('prefers the net weight in grams when several weights are filed', () => {
    const profile = shippingProfileOf(
      articleWith([
        { criteriaId: 212, rawValue: '2' },
        { criteriaId: 3852, rawValue: '1800' },
      ]),
    );

    expect(profile.weightGrams).toBe(1800);
  });

  it('rounds a fractional gram weight up', () => {
    const profile = shippingProfileOf(
      articleWith([{ criteriaId: 212, rawValue: '0,0004' }]),
    );

    expect(profile.weightGrams).toBe(1);
  });

  it('drops a package size missing any of its three sides', () => {
    const profile = shippingProfileOf(
      articleWith([
        { criteriaId: 1620, rawValue: '30' },
        { criteriaId: 1621, rawValue: '20' },
      ]),
    );

    expect(profile.packageCm).toBeNull();
  });

  it('ignores values that are not a bare positive number', () => {
    const profile = shippingProfileOf(
      articleWith([
        { criteriaId: 3852, rawValue: 'n/a' },
        { criteriaId: 683, rawValue: '1 250' },
        { criteriaId: 212, rawValue: '0' },
        { criteriaId: 1620, rawValue: '10' },
        { criteriaId: 1621, rawValue: '10' },
        { criteriaId: 1622, rawValue: '-' },
      ]),
    );

    expect(profile).toEqual({ weightGrams: null, packageCm: null });
  });

  describe('logistics criteria', () => {
    function withLogistics(
      article: TecDocArticleRecord,
      criteria: Array<{ criteriaId: number; rawValue: string }>,
    ): TecDocArticleRecord {
      return { ...article, articleLogisticsCriteria: criteria };
    }

    it('reads a packed weight in grams and a box in millimetres as centimetres', () => {
      const profile = shippingProfileOf(
        withLogistics(articleWith([]), [
          { criteriaId: 3870, rawValue: '1450' },
          { criteriaId: 4197, rawValue: '385' },
          { criteriaId: 4198, rawValue: '120' },
          { criteriaId: 4199, rawValue: '75,5' },
        ]),
      );

      expect(profile).toEqual({
        weightGrams: 1450,
        packageCm: { length: 38.5, width: 12, height: 7.55 },
      });
    });

    it('prefers the packed figures over the article criteria', () => {
      const profile = shippingProfileOf(
        withLogistics(
          articleWith([
            { criteriaId: 3852, rawValue: '1200' },
            { criteriaId: 1620, rawValue: '30' },
            { criteriaId: 1621, rawValue: '10' },
            { criteriaId: 1622, rawValue: '5' },
          ]),
          [
            { criteriaId: 3870, rawValue: '1450' },
            { criteriaId: 4197, rawValue: '385' },
            { criteriaId: 4198, rawValue: '120' },
            { criteriaId: 4199, rawValue: '80' },
          ],
        ),
      );

      expect(profile).toEqual({
        weightGrams: 1450,
        packageCm: { length: 38.5, width: 12, height: 8 },
      });
    });

    it('takes each half from wherever it is known', () => {
      const profile = shippingProfileOf(
        withLogistics(articleWith([{ criteriaId: 3852, rawValue: '1200' }]), [
          { criteriaId: 4197, rawValue: '385' },
          { criteriaId: 4198, rawValue: '120' },
          { criteriaId: 4199, rawValue: '80' },
        ]),
      );

      expect(profile).toEqual({
        weightGrams: 1200,
        packageCm: { length: 38.5, width: 12, height: 8 },
      });
    });

    it('falls back to the article box when the logistics box is incomplete', () => {
      const profile = shippingProfileOf(
        withLogistics(
          articleWith([
            { criteriaId: 1620, rawValue: '30' },
            { criteriaId: 1621, rawValue: '10' },
            { criteriaId: 1622, rawValue: '5' },
          ]),
          [
            { criteriaId: 3870, rawValue: '1450' },
            { criteriaId: 4197, rawValue: '385' },
          ],
        ),
      );

      expect(profile).toEqual({
        weightGrams: 1450,
        packageCm: { length: 30, width: 10, height: 5 },
      });
    });
  });

  it('knows nothing about an article without criteria', () => {
    const article = { ...articleWith([]), articleCriteria: undefined };

    expect(shippingProfileOf(article)).toEqual({
      weightGrams: null,
      packageCm: null,
    });
  });
});
