import {
  BrandDto,
  PaginatedSearchArticlesDto,
  ArticleSummaryDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { BrandsTecDoc } from './brands.tecdoc';
import { BrandsService } from './brands.service';

const BRANDS: BrandDto[] = [
  { brandName: 'Bosch', logoUrl: 'https://logo/bosch.png' },
  { brandName: 'Ferodo', logoUrl: null },
];

function articleItem(
  overrides: Partial<ArticleSummaryDto> = {},
): ArticleSummaryDto {
  return {
    articleNumber: 'A1',
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
    it('joins logos by brand name and leaves unknown brands null', async () => {
      const result = await service.attachLogos([
        articleItem({ brandName: 'Bosch' }),
        articleItem({ articleNumber: 'A2', brandName: 'Unknown' }),
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
        items: [articleItem({ brandName: 'Bosch' })],
        facets: [
          {
            id: 'brands',
            label: 'Производител',
            values: [
              { id: '1', label: 'Bosch', count: 1, imageUrl: null },
              { id: '2', label: 'Ferodo', count: 1, imageUrl: null },
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
  });
});
