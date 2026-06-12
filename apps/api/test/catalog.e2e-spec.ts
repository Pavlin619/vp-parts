import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import { TecDocClient } from '../src/catalog/tecdoc/tecdoc-client';
import { REDIS_CLIENT } from '../src/catalog/tecdoc/tecdoc-cache.service';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedArticlesDto,
  ArticleDetailDto,
} from '@vp-parts-shop/shared';

const MANUFACTURERS: ManufacturerDto[] = [
  { id: '16', name: 'Volkswagen' },
  { id: '5', name: 'BMW' },
];

const MODEL_SERIES: ModelSeriesDto[] = [
  { id: '2', manufacturerId: '16', name: 'Golf' },
  { id: '3', manufacturerId: '16', name: 'Passat' },
];

const VEHICLE_VARIANTS: VehicleVariantDto[] = [
  {
    vehicleId: '10001',
    seriesId: '2',
    name: 'Golf VII 2.0 TDI',
    yearFrom: 2012,
    yearTo: 2020,
    engine: 'CRBC',
    powerKw: 110,
    fuelType: 'Diesel',
    bodyType: 'Hatchback',
  },
];

const ASSEMBLY_GROUPS: AssemblyGroupDto[] = [
  { id: '100001', name: 'Brake System', parentId: null },
  { id: '100002', name: 'Brake Discs', parentId: '100001' },
];

const PAGINATED_ARTICLES: PaginatedArticlesDto = {
  total: 2,
  page: 1,
  pageSize: 20,
  items: [
    {
      articleNumber: 'BD-001',
      brandName: 'Bosch',
      description: 'Brake Disc',
      thumbnailUrl: null,
      available: false,
      bestPriceExVat: null,
      bestPriceIncVat: null,
    },
    {
      articleNumber: 'BD-002',
      brandName: 'Ferodo',
      description: 'Brake Disc',
      thumbnailUrl: null,
      available: false,
      bestPriceExVat: null,
      bestPriceIncVat: null,
    },
  ],
};

const ARTICLE_DETAIL: ArticleDetailDto = {
  articleNumber: 'BD-001',
  brandName: 'Bosch',
  description: 'Brake Disc',
  images: ['https://example.com/bd-001.jpg'],
  technicalSpecs: [{ key: 'Diameter', value: '288 mm' }],
  oemNumbers: ['1K0 615 301 AA'],
  compatibleVehicles: [],
  fitsVehicle: null,
  available: false,
  stockStatus: 'UNKNOWN',
  estimatedDeliveryDays: null,
  bestPriceExVat: null,
  bestPriceIncVat: null,
};

const mockTecDocClient = {
  getManufacturers: jest.fn(),
  getModelSeries: jest.fn(),
  getVehicleTypes: jest.fn(),
  getAssemblyGroupTree: jest.fn(),
  getArticles: jest.fn(),
  getArticleDetails: jest.fn(),
  searchArticles: jest.fn(),
  getAutocompleteSuggestions: jest.fn(),
};

describe('CatalogController (e2e)', () => {
  let app: INestApplication;
  let redisClient: Redis;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(TecDocClient).useValue(mockTecDocClient);
    });
    redisClient = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
    await redisClient.quit();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await redisClient.flushall();
  });

  describe('GET /catalog/manufacturers', () => {
    it('returns manufacturer list from TecDoc', async () => {
      mockTecDocClient.getManufacturers.mockResolvedValueOnce(MANUFACTURERS);

      const res = await request(app.getHttpServer())
        .get('/catalog/manufacturers')
        .expect(200);

      expect(res.body).toEqual(MANUFACTURERS);
      expect(mockTecDocClient.getManufacturers).toHaveBeenCalledTimes(1);
    });

    it('serves the second request from cache without calling TecDoc again', async () => {
      mockTecDocClient.getManufacturers.mockResolvedValueOnce(MANUFACTURERS);

      await request(app.getHttpServer()).get('/catalog/manufacturers').expect(200);
      const res = await request(app.getHttpServer())
        .get('/catalog/manufacturers')
        .expect(200);

      expect(res.body).toEqual(MANUFACTURERS);
      expect(mockTecDocClient.getManufacturers).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /catalog/manufacturers/:manufacturerId/model-series', () => {
    it('returns model series for the manufacturer and forwards the id to TecDoc', async () => {
      mockTecDocClient.getModelSeries.mockResolvedValueOnce(MODEL_SERIES);

      const res = await request(app.getHttpServer())
        .get('/catalog/manufacturers/16/model-series')
        .expect(200);

      expect(res.body).toEqual(MODEL_SERIES);
      expect(mockTecDocClient.getModelSeries).toHaveBeenCalledWith('16');
    });
  });

  describe('GET /catalog/model-series/:seriesId/variants', () => {
    it('returns vehicle variants and forwards the series id to TecDoc', async () => {
      mockTecDocClient.getVehicleTypes.mockResolvedValueOnce(VEHICLE_VARIANTS);

      const res = await request(app.getHttpServer())
        .get('/catalog/model-series/2/variants')
        .expect(200);

      expect(res.body).toEqual(VEHICLE_VARIANTS);
      expect(mockTecDocClient.getVehicleTypes).toHaveBeenCalledWith('2');
    });
  });

  describe('GET /catalog/vehicles/:vehicleId/categories', () => {
    it('returns the assembly group tree and forwards the vehicle id to TecDoc', async () => {
      mockTecDocClient.getAssemblyGroupTree.mockResolvedValueOnce(ASSEMBLY_GROUPS);

      const res = await request(app.getHttpServer())
        .get('/catalog/vehicles/10001/categories')
        .expect(200);

      expect(res.body).toEqual(ASSEMBLY_GROUPS);
      expect(mockTecDocClient.getAssemblyGroupTree).toHaveBeenCalledWith('10001');
    });
  });

  describe('GET /catalog/vehicles/:vehicleId/categories/:categoryId/articles', () => {
    it('returns articles enriched with inventory data', async () => {
      mockTecDocClient.getArticles.mockResolvedValueOnce(PAGINATED_ARTICLES);

      const res = await request(app.getHttpServer())
        .get('/catalog/vehicles/10001/categories/100001/articles')
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].articleNumber).toBe('BD-001');
      // InventoryService stub overwrites these fields on every article
      expect(res.body.items[0].available).toBe(false);
      expect(res.body.items[0].bestPriceExVat).toBeNull();
      expect(res.body.items[0].bestPriceIncVat).toBeNull();
    });

    it('forwards page and pageSize query params to TecDoc', async () => {
      mockTecDocClient.getArticles.mockResolvedValueOnce({
        ...PAGINATED_ARTICLES,
        page: 2,
        pageSize: 10,
        items: [],
      });

      await request(app.getHttpServer())
        .get('/catalog/vehicles/10001/categories/100001/articles?page=2&pageSize=10')
        .expect(200);

      expect(mockTecDocClient.getArticles).toHaveBeenCalledWith(
        '10001',
        '100001',
        2,
        10,
      );
    });

    it('defaults to page 1 and pageSize 20 when query params are absent', async () => {
      mockTecDocClient.getArticles.mockResolvedValueOnce(PAGINATED_ARTICLES);

      await request(app.getHttpServer())
        .get('/catalog/vehicles/10001/categories/100001/articles')
        .expect(200);

      expect(mockTecDocClient.getArticles).toHaveBeenCalledWith(
        '10001',
        '100001',
        1,
        20,
      );
    });
  });

  describe('GET /catalog/articles/:articleNumber', () => {
    it('returns article detail enriched with inventory data', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(ARTICLE_DETAIL);

      const res = await request(app.getHttpServer())
        .get('/catalog/articles/BD-001')
        .expect(200);

      expect(res.body.articleNumber).toBe('BD-001');
      expect(res.body.brandName).toBe('Bosch');
      expect(res.body.images).toEqual(['https://example.com/bd-001.jpg']);
      expect(res.body.technicalSpecs).toEqual([{ key: 'Diameter', value: '288 mm' }]);
      // Inventory stub values applied by CatalogService.getArticleDetail
      expect(res.body.available).toBe(false);
      expect(res.body.stockStatus).toBe('UNKNOWN');
      expect(res.body.estimatedDeliveryDays).toBeNull();
      expect(res.body.bestPriceExVat).toBeNull();
      expect(res.body.bestPriceIncVat).toBeNull();
    });

    it('forwards the optional vehicleId query param to TecDoc', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(ARTICLE_DETAIL);

      await request(app.getHttpServer())
        .get('/catalog/articles/BD-001?vehicleId=10001')
        .expect(200);

      expect(mockTecDocClient.getArticleDetails).toHaveBeenCalledWith(
        'BD-001',
        '10001',
      );
    });

    it('returns 404 when TecDoc does not find the article', async () => {
      mockTecDocClient.getArticleDetails.mockRejectedValueOnce(
        new Error('Article not found: NOTFOUND'),
      );

      await request(app.getHttpServer())
        .get('/catalog/articles/NOTFOUND')
        .expect(404);
    });
  });
});
