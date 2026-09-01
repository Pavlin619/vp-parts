import { BrandDto, ArticleSummaryDto } from '@vp-parts-shop/shared';
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

  describe('attachSearchLogos', () => {
    it('skips the getBrands read for a result with neither rows nor facets', async () => {
      const result = await service.attachSearchLogos({
        items: [],
        facets: [],
      });

      expect(result).toEqual({ items: [], facets: [] });
      expect(getBrandsMock).not.toHaveBeenCalled();
    });

    it('joins logos onto items and brand facet values', async () => {
      const result = await service.attachSearchLogos({
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
      });

      expect(result.items[0].brandLogoUrl).toBe('https://logo/bosch.png');
      expect(result.facets[0].values[0].imageUrl).toBe(
        'https://logo/bosch.png',
      );
      expect(result.facets[0].values[1].imageUrl).toBeNull();
    });

    // The rows and the facets come from two different reads, so each side has to
    // stand on its own: a page of an ordered set carries no facets of its own,
    // and a page past the first carries rows against facets read once.
    it('joins the rows when there are no facets to join', async () => {
      const result = await service.attachSearchLogos({
        items: [articleItem({ brandId: BOSCH })],
        facets: [],
      });

      expect(result.items[0].brandLogoUrl).toBe('https://logo/bosch.png');
    });

    // Facet value ids are only unique within their own facet, so a product type
    // whose genericArticleId equals some dataSupplierId must not inherit that
    // brand's logo.
    it('leaves a non-brand facet untouched even when its ids collide with brand ids', async () => {
      const result = await service.attachSearchLogos({
        items: [articleItem({ brandId: BOSCH })],
        facets: [
          {
            id: 'productTypes',
            values: [{ id: BOSCH, label: 'Маслен филтър', count: 1 }],
          },
        ],
      });

      expect(result.facets[0].values[0]).not.toHaveProperty('imageUrl');
    });
  });
});
