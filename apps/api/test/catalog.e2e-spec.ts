import { INestApplication, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import { CatalogService } from '../src/catalog/catalog.service';

const mockCatalogService = {
  getManufacturers: jest.fn(),
  getModelSeries: jest.fn(),
  getVehicleVariants: jest.fn(),
  getCategoryTree: jest.fn(),
  listArticles: jest.fn(),
  getArticleDetail: jest.fn(),
};

describe('CatalogController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(CatalogService).useValue(mockCatalogService);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /catalog/manufacturers', () => {
    it('returns 200 with manufacturer list (public endpoint)', async () => {
      const manufacturers = [
        { id: '16', name: 'Volkswagen' },
        { id: '5', name: 'BMW' },
      ];
      mockCatalogService.getManufacturers.mockResolvedValueOnce(manufacturers);

      const res = await request(app.getHttpServer())
        .get('/catalog/manufacturers')
        .expect(200);

      expect(res.body).toEqual(manufacturers);
    });
  });

  describe('GET /catalog/manufacturers/:manufacturerId/model-series', () => {
    it('returns 200 with model series list', async () => {
      const series = [{ id: '16_2', manufacturerId: '16', name: 'Golf' }];
      mockCatalogService.getModelSeries.mockResolvedValueOnce(series);

      const res = await request(app.getHttpServer())
        .get('/catalog/manufacturers/16/model-series')
        .expect(200);

      expect(res.body).toEqual(series);
    });
  });

  describe('GET /catalog/model-series/:seriesId/variants', () => {
    it('returns 200 with vehicle variant list', async () => {
      const variants = [
        {
          vehicleId: 'V10042',
          seriesId: '16_2',
          name: 'Golf VII',
          yearFrom: 2012,
          yearTo: 2020,
          engine: '2.0 TDI',
          powerKw: 110,
          fuelType: 'Diesel',
          bodyType: 'Hatchback',
        },
      ];
      mockCatalogService.getVehicleVariants.mockResolvedValueOnce(variants);

      const res = await request(app.getHttpServer())
        .get('/catalog/model-series/16_2/variants')
        .expect(200);

      expect(res.body).toEqual(variants);
    });
  });

  describe('GET /catalog/vehicles/:vehicleId/categories', () => {
    it('returns 200 with category tree', async () => {
      const tree = [
        { id: '1001', name: 'Brakes', parentId: null },
        { id: '2001', name: 'Brake Discs', parentId: '1001' },
      ];
      mockCatalogService.getCategoryTree.mockResolvedValueOnce(tree);

      const res = await request(app.getHttpServer())
        .get('/catalog/vehicles/V10042/categories')
        .expect(200);

      expect(res.body).toEqual(tree);
    });
  });

  describe('GET /catalog/vehicles/:vehicleId/categories/:categoryId/articles', () => {
    it('returns 200 with paginated articles', async () => {
      const paginated = {
        total: 1,
        page: 1,
        pageSize: 20,
        items: [
          {
            articleNumber: 'WL6340',
            brandName: 'WIX',
            description: 'Oil Filter',
            thumbnailUrl: null,
            available: true,
            bestPriceExVat: 1250,
            bestPriceIncVat: 1500,
          },
        ],
      };
      mockCatalogService.listArticles.mockResolvedValueOnce(paginated);

      const res = await request(app.getHttpServer())
        .get('/catalog/vehicles/V10042/categories/1001/articles')
        .expect(200);

      const body = res.body as {
        total: number;
        items: Array<{ articleNumber: string }>;
      };
      expect(body.total).toBe(1);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].articleNumber).toBe('WL6340');
    });

    it('passes page and pageSize query params', async () => {
      mockCatalogService.listArticles.mockResolvedValueOnce({
        total: 0,
        page: 2,
        pageSize: 10,
        items: [],
      });

      await request(app.getHttpServer())
        .get(
          '/catalog/vehicles/V10042/categories/1001/articles?page=2&pageSize=10',
        )
        .expect(200);

      expect(mockCatalogService.listArticles).toHaveBeenCalledWith(
        'V10042',
        '1001',
        2,
        10,
      );
    });
  });

  describe('GET /catalog/articles/:articleNumber', () => {
    it('returns 200 with article detail', async () => {
      const detail = {
        articleNumber: 'WL6340',
        brandName: 'WIX',
        description: 'Oil Filter',
        images: [],
        technicalSpecs: [],
        oemNumbers: [],
        compatibleVehicles: [],
        fitsVehicle: null,
        available: true,
        stockStatus: 'IN_STOCK',
        estimatedDeliveryDays: 2,
        bestPriceExVat: 1250,
        bestPriceIncVat: 1500,
      };
      mockCatalogService.getArticleDetail.mockResolvedValueOnce(detail);

      const res = await request(app.getHttpServer())
        .get('/catalog/articles/WL6340')
        .expect(200);

      const resBody = res.body as { articleNumber: string; available: boolean };
      expect(resBody.articleNumber).toBe('WL6340');
      expect(resBody.available).toBe(true);
    });

    it('returns 404 when article is not found', async () => {
      mockCatalogService.getArticleDetail.mockRejectedValueOnce(
        new NotFoundException(),
      );

      await request(app.getHttpServer())
        .get('/catalog/articles/NOTFOUND')
        .expect(404);
    });
  });
});
