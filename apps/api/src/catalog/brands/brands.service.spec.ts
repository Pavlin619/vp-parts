import {
  BrandDto,
  PaginatedSearchArticlesDto,
  ArticleSummaryDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { BrandsTecDoc } from './brands.tecdoc';
import { BrandsService } from './brands.service';

const BOSCH = '30';
const FERODO = '101';

const BRANDS: BrandDto[] = [
  { brandId: BOSCH, brandName: 'Bosch', logoUrl: 'https://logo/bosch.png' },
  { brandId: FERODO, brandName: 'Ferodo', logoUrl: null },
];

function articleItem(
  overrides: Partial<ArticleSummaryDto> = {},
): ArticleSummaryDto {
  return {
    articleNumber: 'A1',
    brandId: BOSCH,
    brandName: 'Bosch',
    brandLogoUrl: null,
    description: 'Part',
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
    ...overrides,
  };
}

describe('BrandsService', () => {
  let getBrandsMock: jest.Mock;
  let cachedMock: jest.Mock;
  let service: BrandsService;

  beforeEach(() => {
    getBrandsMock = jest.fn().mockResolvedValue(BRANDS);
    cachedMock = jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
      loader(),
    );
    const tecdoc = { getBrands: getBrandsMock } as unknown as BrandsTecDoc;
    const cache = { cached: cachedMock } as unknown as RedisCache;
    service = new BrandsService(tecdoc, cache);
  });

  it('caches getBrands under the brands key for 7 days', async () => {
    await service.getBrands();

    expect(cachedMock).toHaveBeenCalledWith(
      'tecdoc:brands:all',
      7 * 24 * 60 * 60,
      expect.any(Function),
    );
    expect(getBrandsMock).toHaveBeenCalledTimes(1);
  });

  describe('attachLogos', () => {
    it('joins logos by brand id and leaves unknown brands null', async () => {
      const result = await service.attachLogos([
        articleItem({ brandId: BOSCH }),
        articleItem({ articleNumber: 'A2', brandId: '9999' }),
      ]);

      expect(result[0].brandLogoUrl).toBe('https://logo/bosch.png');
      expect(result[1].brandLogoUrl).toBeNull();
    });

    it('skips the getBrands read entirely for an empty batch', async () => {
      const result = await service.attachLogos([]);

      expect(result).toEqual([]);
      expect(getBrandsMock).not.toHaveBeenCalled();
    });
  });

  describe('applyLogosToSearchResults', () => {
    const emptyResults: PaginatedSearchArticlesDto = {
      total: 0,
      page: 1,
      pageSize: 20,
      maxPage: 0,
      items: [],
      facets: [],
      attributes: [],
      categoryNavigation: { current: null, options: [] },
    };

    it('skips the getBrands read for a fully empty result', async () => {
      const result = await service.applyLogosToSearchResults(emptyResults);

      expect(result).toBe(emptyResults);
      expect(getBrandsMock).not.toHaveBeenCalled();
    });

    it('joins logos onto items and brand facet values', async () => {
      const results: PaginatedSearchArticlesDto = {
        ...emptyResults,
        total: 1,
        items: [articleItem({ brandId: BOSCH })],
        facets: [
          {
            id: 'brands',
            values: [
              { id: BOSCH, label: 'Bosch', count: 1, imageUrl: null },
              { id: FERODO, label: 'Ferodo', count: 1, imageUrl: null },
            ],
          },
        ],
      };

      const result = await service.applyLogosToSearchResults(results);

      expect(result.items[0].brandLogoUrl).toBe('https://logo/bosch.png');
      expect(result.facets[0].values[0].imageUrl).toBe(
        'https://logo/bosch.png',
      );
      expect(result.facets[0].values[1].imageUrl).toBeNull();
    });

    // Facet value ids are only unique within their own facet, so a product type
    // whose genericArticleId equals some dataSupplierId must not inherit that
    // brand's logo.
    it('leaves a non-brand facet untouched even when its ids collide with brand ids', async () => {
      const productTypes: PaginatedSearchArticlesDto = {
        ...emptyResults,
        total: 1,
        items: [articleItem({ brandId: BOSCH })],
        facets: [
          {
            id: 'productTypes',
            values: [{ id: BOSCH, label: 'Маслен филтър', count: 1 }],
          },
        ],
      };

      const result = await service.applyLogosToSearchResults(productTypes);

      expect(result.facets[0].values[0]).not.toHaveProperty('imageUrl');
    });
  });
});
