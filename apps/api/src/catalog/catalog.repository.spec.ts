import { CatalogRepository } from './catalog.repository';
import { TecDocCacheService } from './tecdoc/tecdoc-cache.service';

const getArticleDetailsMock = jest.fn();
const getBrandsMock = jest.fn();
const getArticlesMock = jest.fn();
const searchArticlesMock = jest.fn();
const getSubstitutesMock = jest.fn();

const mockCache = {
  getArticleDetails: getArticleDetailsMock,
  getBrands: getBrandsMock,
  getArticles: getArticlesMock,
  searchArticles: searchArticlesMock,
  getSubstitutes: getSubstitutesMock,
} as unknown as TecDocCacheService;

const baseDetail = {
  articleNumber: 'OF-OC115',
  brandName: 'MANN-FILTER',
  brandLogoUrl: null,
  description: 'Oil Filter',
  thumbnailUrl: null,
  images: [],
  technicalSpecs: [],
  oemNumbers: [],
  compatibleVehicles: [],
  fitsVehicle: null,
};

const summary = (brandName: string, articleNumber = 'OF-OC115') => ({
  articleNumber,
  brandName,
  brandLogoUrl: null,
  description: 'Oil Filter',
  thumbnailUrl: null,
  technicalSpecs: [],
  oemNumbers: [],
  fitsVehicle: null,
});

const BRANDS = [
  { brandName: 'Bosch', logoUrl: 'https://logos/bosch.png' },
  { brandName: 'MANN-FILTER', logoUrl: 'https://logos/mann.png' },
];

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

  describe('findArticles', () => {
    it('joins the brand logo onto every list row by brand name', async () => {
      getArticlesMock.mockResolvedValueOnce({
        total: 2,
        page: 1,
        pageSize: 20,
        items: [summary('Bosch', 'BD-001'), summary('MANN-FILTER', 'OF-OC115')],
      });
      getBrandsMock.mockResolvedValueOnce(BRANDS);

      const result = await repository.findArticles('10042', '1001', 1, 20);

      expect(result.total).toBe(2);
      expect(result.items[0].brandLogoUrl).toBe('https://logos/bosch.png');
      expect(result.items[1].brandLogoUrl).toBe('https://logos/mann.png');
    });

    it('leaves the logo null when the brand has none on file', async () => {
      getArticlesMock.mockResolvedValueOnce({
        total: 1,
        page: 1,
        pageSize: 20,
        items: [summary('UNKNOWN', 'X-1')],
      });
      getBrandsMock.mockResolvedValueOnce(BRANDS);

      const result = await repository.findArticles('10042', '1001', 1, 20);

      expect(result.items[0].brandLogoUrl).toBeNull();
    });

    it('skips the brands read entirely for an empty page', async () => {
      getArticlesMock.mockResolvedValueOnce({
        total: 0,
        page: 1,
        pageSize: 20,
        items: [],
      });

      await repository.findArticles('10042', '1001', 1, 20);

      expect(getBrandsMock).not.toHaveBeenCalled();
    });
  });

  describe('searchArticles', () => {
    const paginated = (items: ReturnType<typeof summary>[]) => ({
      total: items.length,
      page: 1,
      pageSize: 20,
      items,
    });

    it('joins the brand logo onto every search hit and preserves pagination', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        paginated([summary('Bosch', 'BD-001')]),
      );
      getBrandsMock.mockResolvedValueOnce(BRANDS);

      const result = await repository.searchArticles(
        'BD-001',
        undefined,
        undefined,
        1,
        20,
      );

      expect(result.items[0].brandLogoUrl).toBe('https://logos/bosch.png');
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'BD-001',
        undefined,
        undefined,
        1,
        20,
      );
    });

    it('skips the brands read entirely for an empty result set', async () => {
      searchArticlesMock.mockResolvedValueOnce(paginated([]));

      await repository.searchArticles('NOPE');

      expect(getBrandsMock).not.toHaveBeenCalled();
    });
  });

  describe('findSubstitutes', () => {
    it('joins the brand logo onto every substitute row', async () => {
      getSubstitutesMock.mockResolvedValueOnce([summary('MANN-FILTER')]);
      getBrandsMock.mockResolvedValueOnce(BRANDS);

      const result = await repository.findSubstitutes('OX 982D');

      expect(result[0].brandLogoUrl).toBe('https://logos/mann.png');
    });
  });
});
