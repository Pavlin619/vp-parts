import {
  mapArticleSummary,
  mapOemNumbers,
  TecDocArticleRecord,
} from './article-mapper';

describe('mapArticleSummary', () => {
  it('maps identity, description, thumbnail and specs from a raw record', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'OC-115',
      dataSupplierId: 72,
      mfrName: 'MANN-FILTER',
      genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
      images: [{ imageURL800: 'https://img/oc115.jpg' }],
      articleCriteria: [
        { criteriaDescription: 'Height', formattedValue: '89 mm' },
      ],
      oemNumbers: [
        {
          articleNumber: '06J 115 403 Q',
          mfrName: 'VW',
          referenceTypeDescription: 'Interchangeable',
        },
      ],
    };

    expect(mapArticleSummary(raw)).toEqual({
      articleNumber: 'OC-115',
      brandId: '72',
      brandName: 'MANN-FILTER',
      brandLogoUrl: null,
      description: 'Oil Filter',
      thumbnailUrl: 'https://img/oc115.jpg',
      technicalSpecs: [{ key: 'Height', value: '89 mm' }],
      fitsVehicle: null,
    });
  });

  // They are the bulkiest field on an article and no list row renders them, so
  // the list calls do not request them and the summary does not carry them.
  it('leaves OE numbers out even when the record carries them', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'OC-115',
      dataSupplierId: 72,
      mfrName: 'MANN-FILTER',
      oemNumbers: [{ articleNumber: '06J 115 403 Q', mfrName: 'VW' }],
    };

    expect(mapArticleSummary(raw)).not.toHaveProperty('oemNumbers');
  });

  // TecDoc carries two brand-ish ids and only `dataSupplierId` is the one
  // `getArticles` and `getBrands` are keyed by.
  it('takes the brand id from the data supplier, not the manufacturer', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'OC-115',
      dataSupplierId: 72,
      mfrName: 'MANN-FILTER',
    };

    expect(mapArticleSummary(raw).brandId).toBe('72');
  });

  it('keeps one OE number per manufacturer that files it', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'OC-115',
      dataSupplierId: 72,
      mfrName: 'MANN-FILTER',
      oemNumbers: [
        { articleNumber: '06J 115 403 Q', mfrName: 'VW' },
        { articleNumber: '06J 115 403 Q', mfrName: 'VW' },
        { articleNumber: '06J 115 403 Q', mfrName: 'AUDI' },
      ],
    };

    expect(mapOemNumbers(raw.oemNumbers)).toEqual([
      {
        articleNumber: '06J 115 403 Q',
        manufacturerName: 'VW',
        interchangeability: null,
      },
      {
        articleNumber: '06J 115 403 Q',
        manufacturerName: 'AUDI',
        interchangeability: null,
      },
    ]);
  });

  it('falls back to a null manufacturer when TecDoc files none', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'OC-115',
      dataSupplierId: 72,
      mfrName: 'MANN-FILTER',
      oemNumbers: [{ articleNumber: '1J0 115 403 C' }],
    };

    expect(mapOemNumbers(raw.oemNumbers)).toEqual([
      {
        articleNumber: '1J0 115 403 C',
        manufacturerName: null,
        interchangeability: null,
      },
    ]);
  });

  it('drops a repeated criterion but keeps a repeated label with a new value', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'OC-115',
      dataSupplierId: 72,
      mfrName: 'MANN-FILTER',
      articleCriteria: [
        { criteriaDescription: 'Height', formattedValue: '89 mm' },
        { criteriaDescription: 'Height', formattedValue: '89 mm' },
        { criteriaDescription: 'Note', formattedValue: 'with ABS' },
        {
          criteriaDescription: 'Note',
          formattedValue: 'right-hand drive only',
        },
      ],
    };

    expect(mapArticleSummary(raw).technicalSpecs).toEqual([
      { key: 'Height', value: '89 mm' },
      { key: 'Note', value: 'with ABS' },
      { key: 'Note', value: 'right-hand drive only' },
    ]);
  });

  it('defaults optional collections and leaves the brand logo / fit for later layers', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'X1',
      dataSupplierId: 30,
      mfrName: 'Bosch',
    };

    expect(mapArticleSummary(raw)).toEqual({
      articleNumber: 'X1',
      brandId: '30',
      brandName: 'Bosch',
      brandLogoUrl: null,
      description: '',
      thumbnailUrl: null,
      technicalSpecs: [],
      fitsVehicle: null,
    });
  });
});
