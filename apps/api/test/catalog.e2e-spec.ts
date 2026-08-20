import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import {
  VehiclesTecDoc,
  ArticlesTecDoc,
  BrandsTecDoc,
  LinkedVehiclesTecDoc,
  ArticleNotFoundException,
  AVAILABILITY_MAX_ARTICLE_NUMBERS,
} from '../src/catalog';
import { REDIS_CLIENT } from '../src/redis';
import {
  CatalogArticlesPage,
  CatalogUnavailableException,
} from '../src/tecdoc';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  BrandDto,
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
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

const BOSCH_BRAND_ID = '30';

const PAGINATED_ARTICLES: PaginatedCatalogArticlesDto = {
  total: 2,
  page: 1,
  pageSize: 20,
  items: [
    {
      articleNumber: 'BD-001',
      brandId: BOSCH_BRAND_ID,
      brandName: 'Bosch',
      brandLogoUrl: null,
      description: 'Brake Disc',
      thumbnailUrl: null,
      technicalSpecs: [],
      oemNumbers: [],
      fitsVehicle: null,
    },
    {
      articleNumber: 'BD-002',
      brandId: '101',
      brandName: 'Ferodo',
      brandLogoUrl: null,
      description: 'Brake Disc',
      thumbnailUrl: null,
      technicalSpecs: [],
      oemNumbers: [],
      fitsVehicle: null,
    },
  ],
};

const ARTICLE_DETAIL: ArticleCatalogDetailDto = {
  articleNumber: 'BD-001',
  brandId: BOSCH_BRAND_ID,
  brandName: 'Bosch',
  brandLogoUrl: null,
  description: 'Brake Disc',
  thumbnailUrl: 'https://example.com/bd-001.jpg',
  images: ['https://example.com/bd-001.jpg'],
  technicalSpecs: [{ key: 'Diameter', value: '288 mm' }],
  oemNumbers: [
    {
      articleNumber: '1K0 615 301 AA',
      manufacturerName: 'VW',
      interchangeability: null,
    },
  ],
  fitsVehicle: null,
};

const BRANDS: BrandDto[] = [
  {
    brandId: BOSCH_BRAND_ID,
    brandName: 'Bosch',
    logoUrl: 'https://logos.example/bosch.png',
  },
];

/**
 * What `getArticles` answers with: the mapped page plus the linkage roles that
 * came down with it, which the service pins so the applicable-vehicles section
 * need not read them again.
 */
const ARTICLES_PAGE: CatalogArticlesPage = {
  articles: PAGINATED_ARTICLES,
  roles: PAGINATED_ARTICLES.items.map((row) => ({
    brandId: row.brandId,
    articleNumber: row.articleNumber,
    legacyArticleIds: [555],
  })),
};

const mockTecDocClient = {
  getManufacturers: jest.fn(),
  getModelSeries: jest.fn(),
  getVehicleTypes: jest.fn(),
  getAssemblyGroupTree: jest.fn(),
  getBrands: jest.fn(),
  getArticles: jest.fn(),
  getArticleDetails: jest.fn(),
  getComparableArticles: jest.fn(),
  getLegacyArticleIds: jest.fn(),
  getLinkedManufacturers: jest.fn(),
  getLinkedTargetIds: jest.fn(),
  getVehiclesByIds: jest.fn(),
  searchArticles: jest.fn(),
  getAutocompleteArticles: jest.fn(),
  getAutocompleteTerms: jest.fn(),
};

describe('CatalogController (e2e)', () => {
  let app: INestApplication;
  let redisClient: Redis;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(VehiclesTecDoc).useValue(mockTecDocClient);
      builder.overrideProvider(ArticlesTecDoc).useValue(mockTecDocClient);
      builder.overrideProvider(BrandsTecDoc).useValue(mockTecDocClient);
      builder.overrideProvider(LinkedVehiclesTecDoc).useValue(mockTecDocClient);
    });
    redisClient = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    resetRateLimits(app);
    // The article-detail flow joins a brand logo via getBrands; give every test
    // a default brand set so the join resolves.
    mockTecDocClient.getBrands.mockResolvedValue(BRANDS);
    // Both applicable-vehicles routes resolve the article's roles first;
    // default the chain to empty so a test only stubs the step it cares about.
    mockTecDocClient.getLegacyArticleIds.mockResolvedValue([]);
    mockTecDocClient.getLinkedManufacturers.mockResolvedValue([]);
    mockTecDocClient.getLinkedTargetIds.mockResolvedValue([]);
    mockTecDocClient.getVehiclesByIds.mockResolvedValue([]);
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

      await request(app.getHttpServer())
        .get('/catalog/manufacturers')
        .expect(200);
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
      expect(mockTecDocClient.getModelSeries).toHaveBeenCalledWith(16);
    });
  });

  describe('GET /catalog/model-series/:seriesId/variants', () => {
    it('returns vehicle variants and forwards the series id to TecDoc', async () => {
      mockTecDocClient.getVehicleTypes.mockResolvedValueOnce(VEHICLE_VARIANTS);

      const res = await request(app.getHttpServer())
        .get('/catalog/model-series/2/variants')
        .expect(200);

      expect(res.body).toEqual(VEHICLE_VARIANTS);
      expect(mockTecDocClient.getVehicleTypes).toHaveBeenCalledWith(2);
    });
  });

  describe('GET /catalog/vehicles/:vehicleId/categories', () => {
    it('returns the assembly group tree and forwards the vehicle id to TecDoc', async () => {
      mockTecDocClient.getAssemblyGroupTree.mockResolvedValueOnce(
        ASSEMBLY_GROUPS,
      );

      const res = await request(app.getHttpServer())
        .get('/catalog/vehicles/10001/categories')
        .expect(200);

      expect(res.body).toEqual(ASSEMBLY_GROUPS);
      expect(mockTecDocClient.getAssemblyGroupTree).toHaveBeenCalledWith(10001);
    });
  });

  // Route ids are parsed by ParseTecDocIdPipe before the controller runs, so an
  // unparseable one never reaches TecDoc as a `null` filter. The pipe is
  // stricter than ParseIntPipe, which would accept `1.5` and truncate it to 1.
  describe('TecDoc id parsing on route params', () => {
    it.each([
      ['/catalog/manufacturers/abc/model-series', 'getModelSeries'],
      ['/catalog/model-series/0/variants', 'getVehicleTypes'],
      ['/catalog/vehicles/1.5/categories', 'getAssemblyGroupTree'],
      ['/catalog/vehicles/-1/categories/100001/articles', 'getArticles'],
    ] as const)('returns 400 for %s', async (url, method) => {
      await request(app.getHttpServer()).get(url).expect(400);

      expect(mockTecDocClient[method]).not.toHaveBeenCalled();
    });
  });

  describe('GET /catalog/vehicles/:vehicleId/categories/:categoryId/articles', () => {
    it('returns cacheable catalog metadata without live inventory', async () => {
      mockTecDocClient.getArticles.mockResolvedValueOnce(ARTICLES_PAGE);

      const res = await request(app.getHttpServer())
        .get('/catalog/vehicles/10001/categories/100001/articles')
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].articleNumber).toBe('BD-001');
      // Inventory is fetched live and separately (GET /catalog/articles-availability),
      // so the cached metadata payload carries no price/stock fields.
      expect(res.body.items[0]).not.toHaveProperty('available');
      expect(res.body.items[0]).not.toHaveProperty('bestPriceExVat');
      expect(res.body.items[0]).not.toHaveProperty('availabilityByWarehouse');
    });

    it('forwards page and pageSize query params to TecDoc', async () => {
      mockTecDocClient.getArticles.mockResolvedValueOnce({
        articles: { ...PAGINATED_ARTICLES, page: 2, pageSize: 10, items: [] },
        roles: [],
      });

      await request(app.getHttpServer())
        .get(
          '/catalog/vehicles/10001/categories/100001/articles?page=2&pageSize=10',
        )
        .expect(200);

      expect(mockTecDocClient.getArticles).toHaveBeenCalledWith(
        10001,
        100001,
        2,
        10,
      );
    });

    it('defaults to page 1 and pageSize 20 when query params are absent', async () => {
      mockTecDocClient.getArticles.mockResolvedValueOnce(ARTICLES_PAGE);

      await request(app.getHttpServer())
        .get('/catalog/vehicles/10001/categories/100001/articles')
        .expect(200);

      expect(mockTecDocClient.getArticles).toHaveBeenCalledWith(
        10001,
        100001,
        1,
        20,
      );
    });
  });

  describe('GET /catalog/articles-availability', () => {
    it('returns live availability keyed by number and is not cached', async () => {
      const res = await request(app.getHttpServer())
        .get('/catalog/articles-availability?numbers=BD-001,BD-002')
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      // No stock in the test DB -> neutral unavailable detail per requested number.
      expect(res.body['BD-001']).toEqual({
        available: false,
        bestPriceExVat: null,
        bestPriceIncVat: null,
        availabilityByWarehouse: [],
        computedAt: expect.any(String),
      });
    });

    // The response is a map keyed by article number, so answering an empty
    // request with `{}` would be indistinguishable from "none of these are in
    // stock" and would render a whole grid as out of stock. A request that asks
    // about nothing is a caller bug and is answered as one.
    it.each([
      ['no numbers param', '/catalog/articles-availability'],
      ['an empty numbers param', '/catalog/articles-availability?numbers='],
      [
        'a numbers param of only separators',
        '/catalog/articles-availability?numbers=%20,%20',
      ],
    ])('returns 400 for %s', async (_label, url) => {
      await request(app.getHttpServer()).get(url).expect(400);
    });

    // Unbounded batches fan out into a single `IN (...)` against the shared
    // database on an endpoint that is deliberately never cached.
    it('returns 400 for a batch over the cap', async () => {
      const numbers = Array.from(
        { length: AVAILABILITY_MAX_ARTICLE_NUMBERS + 1 },
        (_, index) => `A${index}`,
      ).join(',');

      await request(app.getHttpServer())
        .get(`/catalog/articles-availability?numbers=${numbers}`)
        .expect(400);
    });

    it('accepts a batch at the cap', async () => {
      const numbers = Array.from(
        { length: AVAILABILITY_MAX_ARTICLE_NUMBERS },
        (_, index) => `A${index}`,
      ).join(',');

      await request(app.getHttpServer())
        .get(`/catalog/articles-availability?numbers=${numbers}`)
        .expect(200);
    });

    // Exercises the real SQL read against the seeded backoffice stock tables:
    // OF-OC115 is our own-stock scenario (CENTRAL / IN_STOCK, qty 25, price
    // 8.50 / 10.20) from infra/db/02-mock-stock-seed.sql.
    it('returns seeded availability for an own-stock part', async () => {
      const res = await request(app.getHttpServer())
        .get('/catalog/articles-availability?numbers=OF-OC115')
        .expect(200);

      expect(res.body['OF-OC115']).toEqual({
        available: true,
        bestPriceExVat: 850,
        bestPriceIncVat: 1020,
        availabilityByWarehouse: [
          expect.objectContaining({
            warehouseId: 'CENTRAL',
            quantity: 25,
            deliveryWorkDays: 0,
          }),
        ],
        computedAt: expect.any(String),
      });
    });
  });

  describe('GET /catalog/brands/:brandId/articles/:articleNumber', () => {
    it('returns cacheable catalog metadata only, without live inventory', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(ARTICLE_DETAIL);

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001')
        .expect(200);

      expect(res.body.articleNumber).toBe('BD-001');
      expect(res.body.brandName).toBe('Bosch');
      // Logo joined from getBrands by brand id.
      expect(res.body.brandLogoUrl).toBe('https://logos.example/bosch.png');
      expect(res.body.images).toEqual(['https://example.com/bd-001.jpg']);
      expect(res.body.technicalSpecs).toEqual([
        { key: 'Diameter', value: '288 mm' },
      ]);
      // Price/stock is fetched live and separately via
      // GET /catalog/articles-availability, so the detail payload carries none.
      expect(res.body).not.toHaveProperty('available');
      expect(res.body).not.toHaveProperty('bestPriceExVat');
      expect(res.body).not.toHaveProperty('availabilityByWarehouse');
    });

    it('forwards the brand and the optional vehicleId to TecDoc', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(ARTICLE_DETAIL);

      await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001?vehicleId=10001')
        .expect(200);

      expect(mockTecDocClient.getArticleDetails).toHaveBeenCalledWith(
        30,
        'BD-001',
        10001,
      );
    });

    // The regression this route exists for: an article number is unique only
    // within a data supplier, so two brands filing one number are two parts —
    // and each has to be served its own, not whichever was cached first.
    it('serves two brands sharing an article number as different parts', async () => {
      mockTecDocClient.getArticleDetails
        .mockResolvedValueOnce({ ...ARTICLE_DETAIL, articleNumber: 'OX 982D' })
        .mockResolvedValueOnce({
          ...ARTICLE_DETAIL,
          articleNumber: 'OX 982D',
          brandId: '94',
          brandName: 'KNECHT',
          technicalSpecs: [{ key: 'Filter type', value: 'Filter Insert' }],
        });

      const bosch = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/OX%20982D')
        .expect(200);
      const knecht = await request(app.getHttpServer())
        .get('/catalog/brands/94/articles/OX%20982D')
        .expect(200);

      expect(bosch.body.brandName).toBe('Bosch');
      expect(knecht.body.brandName).toBe('KNECHT');
      expect(knecht.body.technicalSpecs).not.toEqual(bosch.body.technicalSpecs);
      expect(mockTecDocClient.getArticleDetails).toHaveBeenCalledTimes(2);
    });

    it('rejects a vehicleId that is not a TecDoc id', async () => {
      await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001?vehicleId=abc')
        .expect(400, { statusCode: 400, errorCode: 'VALIDATION_ERROR' });

      expect(mockTecDocClient.getArticleDetails).not.toHaveBeenCalled();
    });

    it('rejects a brandId that is not a TecDoc id', async () => {
      await request(app.getHttpServer())
        .get('/catalog/brands/abc/articles/BD-001')
        .expect(400, { statusCode: 400, errorCode: 'VALIDATION_ERROR' });

      expect(mockTecDocClient.getArticleDetails).not.toHaveBeenCalled();
    });

    it('returns 404 ARTICLE_NOT_FOUND when TecDoc does not find the article', async () => {
      mockTecDocClient.getArticleDetails.mockRejectedValueOnce(
        new ArticleNotFoundException(),
      );

      await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/NOTFOUND')
        .expect(404, { statusCode: 404, errorCode: 'ARTICLE_NOT_FOUND' });
    });

    // A TecDoc outage used to be reported as a 404, telling the customer a part
    // we do sell does not exist and inviting the client to cache that as fact.
    it('returns 503 CATALOG_UNAVAILABLE when the catalogue read fails', async () => {
      mockTecDocClient.getArticleDetails.mockRejectedValueOnce(
        new CatalogUnavailableException(),
      );

      await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001')
        .expect(503, { statusCode: 503, errorCode: 'CATALOG_UNAVAILABLE' });
    });
  });

  describe('GET /catalog/articles/:articleNumber/substitutes', () => {
    it('returns the cross-reference parts as catalog metadata only', async () => {
      mockTecDocClient.getComparableArticles.mockResolvedValueOnce([
        {
          articleNumber: 'OC115',
          brandName: 'MANN-FILTER',
          description: 'Oil Filter',
          thumbnailUrl: null,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/catalog/articles/OX%20982D/substitutes')
        .expect(200);

      expect(mockTecDocClient.getComparableArticles).toHaveBeenCalledWith(
        'OX 982D',
      );
      expect(res.body).toHaveLength(1);
      expect(res.body[0].articleNumber).toBe('OC115');
      // Availability is fetched live and separately via
      // GET /catalog/articles-availability, so the payload carries none.
      expect(res.body[0]).not.toHaveProperty('available');
      expect(res.body[0]).not.toHaveProperty('bestPriceIncVat');
    });

    it('returns an empty array when the part has no cross-references', async () => {
      mockTecDocClient.getComparableArticles.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get('/catalog/articles/BD-001/substitutes')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /catalog/articles/:articleNumber/alternative-numbers', () => {
    it('returns the cross-reference numbers with the brand that files them', async () => {
      mockTecDocClient.getComparableArticles.mockResolvedValueOnce([
        {
          articleNumber: 'OC115',
          brandName: 'MANN-FILTER',
          description: 'Oil Filter',
          thumbnailUrl: null,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/catalog/articles/OX%20982D/alternative-numbers')
        .expect(200);

      expect(mockTecDocClient.getComparableArticles).toHaveBeenCalledWith(
        'OX 982D',
      );
      // The section renders chips, so the substitutes' catalog metadata is
      // projected away rather than shipped to every expanded row.
      expect(res.body).toEqual([
        { articleNumber: 'OC115', brandName: 'MANN-FILTER' },
      ]);
    });

    it('returns an empty array when the part has no cross-references', async () => {
      mockTecDocClient.getComparableArticles.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get('/catalog/articles/BD-004/alternative-numbers')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET .../linked-vehicles/manufacturers', () => {
    it('returns the makes the part fits', async () => {
      mockTecDocClient.getLegacyArticleIds.mockResolvedValueOnce([555]);
      mockTecDocClient.getLinkedManufacturers.mockResolvedValueOnce([
        { manufacturerId: '5', name: 'BMW' },
      ]);

      const res = await request(app.getHttpServer())
        .get(
          '/catalog/brands/94/articles/OX%20982D/linked-vehicles/manufacturers',
        )
        .expect(200);

      expect(mockTecDocClient.getLegacyArticleIds).toHaveBeenCalledWith(
        94,
        'OX 982D',
      );
      expect(res.body).toEqual([{ manufacturerId: '5', name: 'BMW' }]);
    });

    it('returns an empty array when the part has no catalogued linkages', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/catalog/brands/101/articles/BD-002/linked-vehicles/manufacturers',
        )
        .expect(200);

      expect(res.body).toEqual([]);
    });

    // The route sits under the same prefix as the article detail route, which
    // matches a single trailing segment — the sub-route must win, not 404.
    it('does not collide with the article detail route', async () => {
      await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-003/linked-vehicles/manufacturers')
        .expect(200);

      expect(mockTecDocClient.getArticleDetails).not.toHaveBeenCalled();
    });
  });

  describe('GET .../linked-vehicles', () => {
    function hydrated(carId: number, name: string) {
      return {
        seriesId: '8506',
        seriesName: '3 Series (E90)',
        manufacturerId: '5',
        vehicle: {
          vehicleId: String(carId),
          name,
          yearFrom: 2005,
          yearTo: 2011,
          powerKw: 130,
          powerHp: 177,
          fuelType: 'Diesel',
          engineCodes: ['N47 D20 C'],
        },
      };
    }

    it('returns the vehicles of the make, grouped into model series', async () => {
      mockTecDocClient.getLegacyArticleIds.mockResolvedValueOnce([555]);
      mockTecDocClient.getLinkedTargetIds.mockResolvedValueOnce([10020, 10021]);
      mockTecDocClient.getVehiclesByIds.mockResolvedValueOnce([
        hydrated(10021, '320d Touring'),
        hydrated(10020, '320d'),
      ]);

      const res = await request(app.getHttpServer())
        .get(
          '/catalog/brands/94/articles/OX%20982D/linked-vehicles?manufacturerId=5',
        )
        .expect(200);

      expect(mockTecDocClient.getLinkedTargetIds).toHaveBeenCalledWith(555, 5);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        seriesId: '8506',
        manufacturerId: '5',
        name: '3 Series (E90)',
      });
      expect(
        res.body[0].vehicles.map((vehicle: { name: string }) => vehicle.name),
      ).toEqual(['320d', '320d Touring']);
    });

    // Without the make the answer is every vehicle the part fits, which is the
    // unbounded list this section exists to avoid.
    it('rejects a request with no manufacturer', async () => {
      await request(app.getHttpServer())
        .get('/catalog/brands/94/articles/OX%20982D/linked-vehicles')
        .expect(400);
    });
  });
});
