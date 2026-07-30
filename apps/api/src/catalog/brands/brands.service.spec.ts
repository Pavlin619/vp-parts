import { Logger } from '@nestjs/common';
import {
  BrandDto,
  PaginatedSearchArticlesDto,
  ArticleSummaryDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { BrandsTecDoc } from './brands.tecdoc';
import { BRAND_MEMO_TTL_MS, BrandsService } from './brands.service';

const BRANDS: BrandDto[] = [
  { brandName: 'Bosch', logoUrl: 'https://logo/bosch.png' },
  { brandName: 'Ferodo', logoUrl: null },
];

const EMPTY_RESULTS: PaginatedSearchArticlesDto = {
  total: 0,
  page: 1,
  pageSize: 20,
  items: [],
  facets: [],
  attributes: [],
  categoryNavigation: { current: null, options: [] },
};

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
    jest.useFakeTimers();
    getBrandsMock = jest.fn().mockResolvedValue(BRANDS);
    cachedMock = jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
      loader(),
    );
    const tecdoc = { getBrands: getBrandsMock } as unknown as BrandsTecDoc;
    const cache = { cached: cachedMock } as unknown as RedisCache;
    service = new BrandsService(tecdoc, cache);
  });

  afterEach(() => {
    jest.useRealTimers();
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

  // The Redis entry spares us the TecDoc call; without the memo every request
  // still re-reads and re-parses that entry to rebuild the same lookup.
  describe('in-process memo', () => {
    it('reuses the logo lookup across requests instead of re-reading', async () => {
      await service.getBrandLogoMap();
      await service.getBrandLogoMap();

      expect(cachedMock).toHaveBeenCalledTimes(1);
    });

    it('shares one load across concurrent requests', async () => {
      await Promise.all([
        service.getBrandLogoMap(),
        service.getBrandLogoMap(),
        service.getBrandLogoMap(),
      ]);

      expect(cachedMock).toHaveBeenCalledTimes(1);
    });
  });

  // A logo is decoration on a response the caller has already paid for, so an
  // unavailable brand list must not fail the listing it was decorating.
  describe('when the brand list is unavailable', () => {
    beforeEach(() => {
      getBrandsMock.mockRejectedValue(new Error('TecDoc unavailable'));
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('renders article rows with no logo rather than throwing', async () => {
      const result = await service.attachLogos([
        articleItem({ brandName: 'Bosch' }),
      ]);

      expect(result[0].brandLogoUrl).toBeNull();
    });

    it('returns search results with no logos rather than throwing', async () => {
      const results: PaginatedSearchArticlesDto = {
        ...EMPTY_RESULTS,
        total: 1,
        items: [articleItem({ brandName: 'Bosch' })],
        facets: [
          {
            id: 'brands',
            label: 'Производител',
            values: [{ id: '1', label: 'Bosch', count: 1, imageUrl: null }],
          },
        ],
      };

      const result = await service.applyLogosToSearchResults(results);

      expect(result.items[0].brandLogoUrl).toBeNull();
      expect(result.facets[0].values[0].imageUrl).toBeNull();
    });

    it('serves the last known logos when a later refresh fails', async () => {
      getBrandsMock.mockResolvedValueOnce(BRANDS);
      await service.getBrandLogoMap();
      jest.advanceTimersByTime(BRAND_MEMO_TTL_MS + 1);

      const [row] = await service.attachLogos([
        articleItem({ brandName: 'Bosch' }),
      ]);

      expect(row.brandLogoUrl).toBe('https://logo/bosch.png');
    });
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
    it('skips the getBrands read for a fully empty result', async () => {
      const result = await service.applyLogosToSearchResults(EMPTY_RESULTS);

      expect(result).toBe(EMPTY_RESULTS);
      expect(getBrandsMock).not.toHaveBeenCalled();
    });

    it('joins logos onto items and brand facet values', async () => {
      const results: PaginatedSearchArticlesDto = {
        ...EMPTY_RESULTS,
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
