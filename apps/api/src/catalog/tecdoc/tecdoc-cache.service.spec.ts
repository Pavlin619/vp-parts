import { TecDocCacheService } from './tecdoc-cache.service';
import { TecDocClient } from './tecdoc-client';

const redisGet = jest.fn();
const redisSet = jest.fn();
const mockRedis = { get: redisGet, set: redisSet };

const getManufacturersMock = jest.fn();
const getModelSeriesMock = jest.fn();
const getVehicleTypesMock = jest.fn();
const getAssemblyGroupTreeMock = jest.fn();
const getArticlesMock = jest.fn();
const getArticleDetailsMock = jest.fn();

const mockTecDocClient = {
  getManufacturers: getManufacturersMock,
  getModelSeries: getModelSeriesMock,
  getVehicleTypes: getVehicleTypesMock,
  getAssemblyGroupTree: getAssemblyGroupTreeMock,
  getArticles: getArticlesMock,
  getArticleDetails: getArticleDetailsMock,
} as unknown as TecDocClient;

describe('TecDocCacheService', () => {
  let service: TecDocCacheService;

  beforeEach(() => {
    service = new TecDocCacheService(mockTecDocClient, mockRedis as any);
    jest.clearAllMocks();
  });

  describe('getManufacturers', () => {
    const cacheKey = 'tecdoc:manufacturers:all';
    const data = [{ id: '16', name: 'Volkswagen' }];

    it('returns cached value on Redis hit', async () => {
      redisGet.mockResolvedValueOnce(JSON.stringify(data));

      const result = await service.getManufacturers();

      expect(result).toEqual(data);
      expect(getManufacturersMock).not.toHaveBeenCalled();
    });

    it('calls TecDocClient and populates cache on Redis miss', async () => {
      redisGet.mockResolvedValueOnce(null);
      getManufacturersMock.mockResolvedValueOnce(data);
      redisSet.mockResolvedValueOnce('OK');

      const result = await service.getManufacturers();

      expect(result).toEqual(data);
      expect(getManufacturersMock).toHaveBeenCalledTimes(1);
      expect(redisSet).toHaveBeenCalledWith(
        cacheKey,
        JSON.stringify(data),
        'EX',
        7 * 24 * 60 * 60,
      );
    });
  });

  describe('getModelSeries', () => {
    const manufacturerId = '16';
    const cacheKey = `tecdoc:model-series:${manufacturerId}`;
    const data = [{ id: '16_2', manufacturerId, name: 'Golf' }];

    it('returns cached value on Redis hit', async () => {
      redisGet.mockResolvedValueOnce(JSON.stringify(data));

      const result = await service.getModelSeries(manufacturerId);

      expect(result).toEqual(data);
      expect(getModelSeriesMock).not.toHaveBeenCalled();
    });

    it('calls TecDocClient and populates cache on Redis miss', async () => {
      redisGet.mockResolvedValueOnce(null);
      getModelSeriesMock.mockResolvedValueOnce(data);
      redisSet.mockResolvedValueOnce('OK');

      const result = await service.getModelSeries(manufacturerId);

      expect(result).toEqual(data);
      expect(redisSet).toHaveBeenCalledWith(
        cacheKey,
        JSON.stringify(data),
        'EX',
        7 * 24 * 60 * 60,
      );
    });
  });

  describe('getVehicleTypes', () => {
    const seriesId = '16_2';
    const cacheKey = `tecdoc:vehicle-types:${seriesId}`;
    const data = [
      {
        vehicleId: 'V10042',
        seriesId,
        name: 'Golf VII',
        yearFrom: 2012,
        yearTo: 2020,
        engine: '2.0 TDI',
        powerKw: 110,
        fuelType: 'Diesel',
        bodyType: 'Hatchback',
      },
    ];

    it('uses 7-day TTL (vehicle tree)', async () => {
      redisGet.mockResolvedValueOnce(null);
      getVehicleTypesMock.mockResolvedValueOnce(data);
      redisSet.mockResolvedValueOnce('OK');

      await service.getVehicleTypes(seriesId);

      expect(redisSet).toHaveBeenCalledWith(
        cacheKey,
        expect.any(String),
        'EX',
        7 * 24 * 60 * 60,
      );
    });
  });

  describe('getAssemblyGroupTree', () => {
    const vehicleId = 'V10042';
    const cacheKey = `tecdoc:assembly-groups:${vehicleId}`;
    const data = [{ id: '1001', name: 'Brakes', parentId: null }];

    it('uses 7-day TTL (vehicle tree)', async () => {
      redisGet.mockResolvedValueOnce(null);
      getAssemblyGroupTreeMock.mockResolvedValueOnce(data);
      redisSet.mockResolvedValueOnce('OK');

      await service.getAssemblyGroupTree(vehicleId);

      expect(redisSet).toHaveBeenCalledWith(
        cacheKey,
        expect.any(String),
        'EX',
        7 * 24 * 60 * 60,
      );
    });
  });

  describe('getArticles', () => {
    it('uses 24-hour TTL (article data)', async () => {
      const vehicleId = 'V10042';
      const categoryId = '1001';
      const page = 1;
      const pageSize = 20;
      const cacheKey = `tecdoc:articles:${vehicleId}:${categoryId}:${page}:${pageSize}`;
      const data = { total: 1, page: 1, pageSize: 20, items: [] };

      redisGet.mockResolvedValueOnce(null);
      getArticlesMock.mockResolvedValueOnce(data);
      redisSet.mockResolvedValueOnce('OK');

      await service.getArticles(vehicleId, categoryId, page, pageSize);

      expect(redisSet).toHaveBeenCalledWith(
        cacheKey,
        expect.any(String),
        'EX',
        24 * 60 * 60,
      );
    });
  });

  describe('getArticleDetails', () => {
    it('uses 24-hour TTL (article data)', async () => {
      const articleNumber = 'WL6340';
      const cacheKey = `tecdoc:article-detail:${articleNumber}:none`;
      const data = {
        articleNumber,
        brandName: 'WIX',
        description: 'Oil Filter',
        images: [],
        technicalSpecs: [],
        oemNumbers: [],
        compatibleVehicles: [],
        fitsVehicle: null,
        available: false,
        stockStatus: 'UNKNOWN',
        estimatedDeliveryDays: null,
        bestPriceExVat: null,
        bestPriceIncVat: null,
      };

      redisGet.mockResolvedValueOnce(null);
      getArticleDetailsMock.mockResolvedValueOnce(data);
      redisSet.mockResolvedValueOnce('OK');

      await service.getArticleDetails(articleNumber);

      expect(redisSet).toHaveBeenCalledWith(
        cacheKey,
        expect.any(String),
        'EX',
        24 * 60 * 60,
      );
    });
  });
});
