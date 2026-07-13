import { mapArticleSummary, TecDocArticleRecord } from './article-mapper';

describe('mapArticleSummary', () => {
  it('maps identity, description, thumbnail, specs and OE numbers from a raw record', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'OC-115',
      mfrName: 'MANN-FILTER',
      genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
      images: [{ imageURL800: 'https://img/oc115.jpg' }],
      articleCriteria: [
        { criteriaDescription: 'Height', formattedValue: '89 mm' },
      ],
      oemNumbers: [{ articleNumber: '06J 115 403 Q' }],
    };

    expect(mapArticleSummary(raw)).toEqual({
      articleNumber: 'OC-115',
      brandName: 'MANN-FILTER',
      brandLogoUrl: null,
      description: 'Oil Filter',
      thumbnailUrl: 'https://img/oc115.jpg',
      technicalSpecs: [{ key: 'Height', value: '89 mm' }],
      oemNumbers: ['06J 115 403 Q'],
      fitsVehicle: null,
    });
  });

  it('defaults optional collections and leaves the brand logo / fit for later layers', () => {
    const raw: TecDocArticleRecord = {
      articleNumber: 'X1',
      mfrName: 'Bosch',
    };

    expect(mapArticleSummary(raw)).toEqual({
      articleNumber: 'X1',
      brandName: 'Bosch',
      brandLogoUrl: null,
      description: '',
      thumbnailUrl: null,
      technicalSpecs: [],
      oemNumbers: [],
      fitsVehicle: null,
    });
  });
});
