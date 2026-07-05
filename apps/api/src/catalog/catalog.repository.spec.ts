import { CatalogRepository } from './catalog.repository';
import { TecDocCacheService } from './tecdoc/tecdoc-cache.service';

const getArticleDetailsMock = jest.fn();
const getBrandsMock = jest.fn();

const mockCache = {
  getArticleDetails: getArticleDetailsMock,
  getBrands: getBrandsMock,
} as unknown as TecDocCacheService;

const baseDetail = {
  articleNumber: 'OF-OC115',
  brandName: 'MANN-FILTER',
  brandLogoUrl: null,
  description: 'Oil Filter',
  images: [],
  technicalSpecs: [],
  oemNumbers: [],
  compatibleVehicles: [],
  fitsVehicle: null,
};

describe('CatalogRepository', () => {
  let repository: CatalogRepository;

  beforeEach(() => {
    repository = new CatalogRepository(mockCache);
    jest.clearAllMocks();
  });

  describe('findArticleDetails', () => {
    it('joins the brand logo onto the article by brand name', async () => {
      getArticleDetailsMock.mockResolvedValueOnce(baseDetail);
      getBrandsMock.mockResolvedValueOnce([
        { brandName: 'Bosch', logoUrl: 'https://logos/bosch.png' },
        { brandName: 'MANN-FILTER', logoUrl: 'https://logos/mann.png' },
      ]);

      const result = await repository.findArticleDetails('OF-OC115');

      expect(result.brandLogoUrl).toBe('https://logos/mann.png');
    });

    it('leaves the logo null when no brand matches', async () => {
      getArticleDetailsMock.mockResolvedValueOnce({
        ...baseDetail,
        brandName: 'UNKNOWN',
      });
      getBrandsMock.mockResolvedValueOnce([
        { brandName: 'Bosch', logoUrl: 'https://logos/bosch.png' },
      ]);

      const result = await repository.findArticleDetails('OF-OC115');

      expect(result.brandLogoUrl).toBeNull();
    });

    it('leaves the logo null when the matched brand has no logo on file', async () => {
      getArticleDetailsMock.mockResolvedValueOnce(baseDetail);
      getBrandsMock.mockResolvedValueOnce([
        { brandName: 'MANN-FILTER', logoUrl: null },
      ]);

      const result = await repository.findArticleDetails('OF-OC115');

      expect(result.brandLogoUrl).toBeNull();
    });

    it('passes the vehicleId through to the cache', async () => {
      getArticleDetailsMock.mockResolvedValueOnce(baseDetail);
      getBrandsMock.mockResolvedValueOnce([]);

      await repository.findArticleDetails('OF-OC115', '10042');

      expect(getArticleDetailsMock).toHaveBeenCalledWith('OF-OC115', '10042');
    });
  });
});
