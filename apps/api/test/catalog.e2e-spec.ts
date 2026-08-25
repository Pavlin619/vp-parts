import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import {
  VehiclesTecDoc,
  ArticlesTecDoc,
  BrandsTecDoc,
  CrossReferencesTecDoc,
  LinkedVehiclesTecDoc,
  ArticleNotFoundException,
  AVAILABILITY_MAX_ARTICLES,
} from '../src/catalog';
import { REDIS_CLIENT } from '../src/redis';
import {
  ArticleStatus,
  CatalogArticlesPage,
  CatalogUnavailableException,
  CrossReferenceCandidate,
} from '../src/tecdoc';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  BrandDto,
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
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

/** TecDoc's generic article for a brake disc — what the fixture part is. */
const BRAKE_DISC_TYPE = 82;

/**
 * What the single-article read answers with: the detail plus the generic
 * articles it is catalogued as, which every cross-reference search is narrowed
 * to.
 */
function articleRead(
  detail: ArticleCatalogDetailDto = ARTICLE_DETAIL,
  genericArticleIds: number[] = [BRAKE_DISC_TYPE],
) {
  return { detail, genericArticleIds };
}

/**
 * A cross-reference candidate: another brand's part, citing the viewed one as
 * interchangeable — which is what the provenance filter keeps it for. Its brand
 * is deliberately one `getBrands` does not know, so the logo join leaves
 * `brandLogoUrl` null rather than a row looking pre-filled.
 */
function candidate(
  articleNumber: string,
  cites = 'BD-001',
): CrossReferenceCandidate {
  return {
    brandId: '72',
    brandName: 'MANN-FILTER',
    articleNumber,
    description: 'Brake Disc',
    legacyArticleIds: [legacyIdOf(articleNumber)],
    articleStatusId: ArticleStatus.Normal,
    citedNumbers: [{ brandId: BOSCH_BRAND_ID, articleNumber: cites }],
  };
}

/** Past the sparse threshold, so the OE top-up is not reached. */
function sixCandidates(): CrossReferenceCandidate[] {
  return ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((number) =>
    candidate(number),
  );
}

/** The row a candidate hydrates into, so the two can be paired in a test. */
function hydratedRow(articleNumber: string): ArticleSummaryDto {
  return {
    articleNumber,
    brandId: '72',
    brandName: 'MANN-FILTER',
    brandLogoUrl: null,
    description: 'Brake Disc',
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
  };
}

/**
 * Mints one hydration id per article number and keeps it, so a test can assert
 * which candidates a page paid to hydrate and read the answer back as rows.
 */
const LEGACY_ID_BY_NUMBER = new Map<string, number>();

function legacyIdOf(articleNumber: string): number {
  const existing = LEGACY_ID_BY_NUMBER.get(articleNumber);
  if (existing !== undefined) {
    return existing;
  }

  const minted = 900_001 + LEGACY_ID_BY_NUMBER.size;
  LEGACY_ID_BY_NUMBER.set(articleNumber, minted);

  return minted;
}

function numberOfLegacyId(legacyArticleId: number): string | undefined {
  return [...LEGACY_ID_BY_NUMBER].find(
    ([, minted]) => minted === legacyArticleId,
  )?.[0];
}

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
  getCrossReferenceCandidates: jest.fn(),
  getArticleRowsByLegacyIds: jest.fn(),
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
      builder
        .overrideProvider(CrossReferencesTecDoc)
        .useValue(mockTecDocClient);
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
    // Same for the cross-reference read and the hydration behind it: a test that
    // stubs one and not the other should not be answered with an undefined
    // promise.
    mockTecDocClient.getCrossReferenceCandidates.mockResolvedValue([]);
    mockTecDocClient.getArticleRowsByLegacyIds.mockImplementation(
      (legacyArticleIds: number[]) =>
        Promise.resolve(
          legacyArticleIds
            .map(numberOfLegacyId)
            .filter((number): number is string => number !== undefined)
            .map(hydratedRow),
        ),
    );
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

    // Paging is bounded at the boundary, so nothing out of range reaches TecDoc
    // — which is where an absurd page number would otherwise cost us a call and
    // a cache key before being refused.
    it.each([
      ['a page size above the ceiling', 'pageSize=500'],
      ['a page of zero', 'page=0'],
      ['a page beyond the paging ceiling', 'page=10001'],
      ['paging that is not a number', 'page=abc'],
    ])('rejects %s', async (_label, query) => {
      await request(app.getHttpServer())
        .get(`/catalog/vehicles/10001/categories/100001/articles?${query}`)
        .expect(400, { statusCode: 400, errorCode: 'VALIDATION_ERROR' });

      expect(mockTecDocClient.getArticles).not.toHaveBeenCalled();
    });
  });

  describe('GET /catalog/articles-availability', () => {
    // MANN-FILTER, the brand the seed files OF-OC115 under.
    const MANN = '72';

    it('returns live availability keyed by brand and number, and is not cached', async () => {
      const res = await request(app.getHttpServer())
        .get('/catalog/articles-availability?articles=30:BD-001,30:BD-002')
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      // No stock in the test DB -> neutral unavailable detail per requested article.
      expect(res.body['30:BD-001']).toEqual({
        available: false,
        bestPriceExVat: null,
        bestPriceIncVat: null,
        availabilityByWarehouse: [],
        computedAt: expect.any(String),
      });
    });

    // The response is a map keyed by brand and number, so answering an empty
    // request with `{}` would be indistinguishable from "none of these are in
    // stock" and would render a whole grid as out of stock. A request that asks
    // about nothing is a caller bug and is answered as one.
    it.each([
      ['no articles param', '/catalog/articles-availability'],
      ['an empty articles param', '/catalog/articles-availability?articles='],
      [
        'an articles param of only separators',
        '/catalog/articles-availability?articles=%20,%20',
      ],
      [
        'an article with no brand',
        '/catalog/articles-availability?articles=OF-OC115',
      ],
    ])('returns 400 for %s', async (_label, url) => {
      await request(app.getHttpServer()).get(url).expect(400);
    });

    // Unbounded batches fan out into a single `IN (...)` against the shared
    // database on an endpoint that is deliberately never cached.
    it('returns 400 for a batch over the cap', async () => {
      const articles = Array.from(
        { length: AVAILABILITY_MAX_ARTICLES + 1 },
        (_, index) => `30:A${index}`,
      ).join(',');

      await request(app.getHttpServer())
        .get(`/catalog/articles-availability?articles=${articles}`)
        .expect(400);
    });

    it('accepts a batch at the cap', async () => {
      const articles = Array.from(
        { length: AVAILABILITY_MAX_ARTICLES },
        (_, index) => `30:A${index}`,
      ).join(',');

      await request(app.getHttpServer())
        .get(`/catalog/articles-availability?articles=${articles}`)
        .expect(200);
    });

    // Exercises the real SQL read against the seeded backoffice stock tables:
    // OF-OC115 is our own-stock scenario (CENTRAL / IN_STOCK, qty 25, price
    // 8.50 / 10.20) from infra/db/02-mock-stock-seed.sql.
    it('returns seeded availability for an own-stock part', async () => {
      const res = await request(app.getHttpServer())
        .get(`/catalog/articles-availability?articles=${MANN}:OF-OC115`)
        .expect(200);

      expect(res.body[`${MANN}:OF-OC115`]).toEqual({
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

    // The whole point of carrying the brand: the same number under another data
    // supplier is another part, and must not be priced from this one's stock.
    it('does not answer one brand from another brand\u2019s stock', async () => {
      const res = await request(app.getHttpServer())
        .get('/catalog/articles-availability?articles=30:OF-OC115')
        .expect(200);

      expect(res.body['30:OF-OC115']).toEqual({
        available: false,
        bestPriceExVat: null,
        bestPriceIncVat: null,
        availabilityByWarehouse: [],
        computedAt: expect.any(String),
      });
    });
  });

  describe('GET /catalog/brands/:brandId/articles/:articleNumber', () => {
    it('returns cacheable catalog metadata only, without live inventory', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(articleRead());

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
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(articleRead());

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
        .mockResolvedValueOnce(
          articleRead({ ...ARTICLE_DETAIL, articleNumber: 'OX 982D' }),
        )
        .mockResolvedValueOnce(
          articleRead({
            ...ARTICLE_DETAIL,
            articleNumber: 'OX 982D',
            brandId: '94',
            brandName: 'KNECHT',
            technicalSpecs: [{ key: 'Filter type', value: 'Filter Insert' }],
          }),
        );

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

  describe('GET /catalog/brands/:brandId/articles/:articleNumber/substitutes', () => {
    it('returns one page of the replacing parts as catalog metadata only', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(articleRead());
      mockTecDocClient.getCrossReferenceCandidates.mockResolvedValueOnce(
        sixCandidates(),
      );

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes')
        .expect(200);

      // Searched by the part's own number, narrowed to the type it is: that is
      // what makes the answer other brands' versions of this same part.
      expect(mockTecDocClient.getCrossReferenceCandidates).toHaveBeenCalledWith(
        'BD-001',
        BRAKE_DISC_TYPE,
      );
      expect(res.body).toMatchObject({ total: 6, page: 1, pageSize: 20 });
      expect(res.body.items).toHaveLength(6);
      // Availability is fetched live and separately via
      // GET /catalog/articles-availability, so the payload carries none.
      expect(res.body.items[0]).not.toHaveProperty('available');
      expect(res.body.items[0]).not.toHaveProperty('bestPriceIncVat');
    });

    /**
     * The point of the whole design: `total` counts the set, so the section can
     * offer every alternative, while only the rows on the page are paid for.
     */
    it('counts the whole set but hydrates only the requested page', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValue(articleRead());
      mockTecDocClient.getCrossReferenceCandidates.mockResolvedValue(
        sixCandidates(),
      );

      const first = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes?page=1&pageSize=4')
        .expect(200);

      expect(first.body).toMatchObject({ total: 6, page: 1, pageSize: 4 });
      expect(first.body.items).toHaveLength(4);
      expect(mockTecDocClient.getArticleRowsByLegacyIds).toHaveBeenCalledWith([
        legacyIdOf('A1'),
        legacyIdOf('A2'),
        legacyIdOf('A3'),
        legacyIdOf('A4'),
      ]);

      const second = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes?page=2&pageSize=4')
        .expect(200);

      expect(
        second.body.items.map((row: ArticleSummaryDto) => row.articleNumber),
      ).toEqual(['A5', 'A6']);
    });

    // A page past the end is an empty page of a set that still has a size, not
    // a 404: the pager reads `total` to decide there is nothing more to offer.
    it('answers a page past the end with no rows and the full total', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(articleRead());
      mockTecDocClient.getCrossReferenceCandidates.mockResolvedValueOnce(
        sixCandidates(),
      );

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes?page=9&pageSize=4')
        .expect(200);

      expect(res.body).toMatchObject({ total: 6, page: 9, items: [] });
      expect(mockTecDocClient.getArticleRowsByLegacyIds).not.toHaveBeenCalled();
    });

    /**
     * Paging is validated at the boundary rather than clamped, so a caller asking
     * for something we will not serve is told so. One page of rows is what a
     * hydration read costs, which is what the ceiling protects.
     */
    it.each([
      ['a page size above the ceiling', 'pageSize=500'],
      ['a page size of zero', 'pageSize=0'],
      ['a negative page', 'page=-3'],
      ['a page beyond the paging ceiling', 'page=99999999'],
      ['paging that is not a number', 'page=abc&pageSize=abc'],
      ['a fractional page', 'page=1.5'],
    ])('rejects %s', async (_label, query) => {
      await request(app.getHttpServer())
        .get(`/catalog/brands/30/articles/BD-001/substitutes?${query}`)
        .expect(400, { statusCode: 400, errorCode: 'VALIDATION_ERROR' });

      expect(mockTecDocClient.getArticleDetails).not.toHaveBeenCalled();
    });

    /**
     * The comparable-number index holds only suppliers who cited this brand, so a
     * small one comes back nearly empty. It is served as it is: how many suppliers
     * cite a brand is a property of the data, and one search is the whole answer.
     */
    it('serves a thin result as it is, on one search', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(articleRead());
      mockTecDocClient.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1'),
      ]);

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(
        mockTecDocClient.getCrossReferenceCandidates,
      ).toHaveBeenCalledTimes(1);
    });

    // A row that only shares this part's digits is a different part, and TecDoc
    // returns those too: it matches a number against every supplier's references
    // without regard to whose number it is.
    it('drops a candidate that does not cite this part', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(
        articleRead({ ...ARTICLE_DETAIL, oemNumbers: [] }),
      );
      mockTecDocClient.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1', 'SOMEONE-ELSES'),
      ]);

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes')
        .expect(200);

      expect(res.body).toMatchObject({ total: 0, items: [] });
    });

    // An empty section is the answer for a part nothing replaces. A looser
    // search would fill it with parts a mechanic could fit to the wrong car.
    it('returns an empty page when nothing replaces the part', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(
        articleRead({ ...ARTICLE_DETAIL, oemNumbers: [] }),
      );

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes')
        .expect(200);

      expect(res.body).toMatchObject({ total: 0, items: [] });
    });

    // The search is narrowed to the viewed part's type, so a part TecDoc files no
    // generic article for gets an empty list rather than an unnarrowed search
    // across the whole catalogue.
    it('searches nothing for a part with no generic article', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(
        articleRead(ARTICLE_DETAIL, []),
      );

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes')
        .expect(200);

      expect(res.body).toMatchObject({ total: 0, items: [] });
      expect(
        mockTecDocClient.getCrossReferenceCandidates,
      ).not.toHaveBeenCalled();
    });

    // The search starts from the article itself, so a part the catalogue does
    // not have cannot answer this — it 404s rather than reporting no substitutes.
    it('returns 404 ARTICLE_NOT_FOUND for an unknown part', async () => {
      mockTecDocClient.getArticleDetails.mockRejectedValueOnce(
        new ArticleNotFoundException(),
      );

      await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/NOPE-1/substitutes')
        .expect(404, { statusCode: 404, errorCode: 'ARTICLE_NOT_FOUND' });
    });
  });

  describe('GET /catalog/brands/:brandId/articles/:articleNumber/alternative-numbers', () => {
    it('returns every alternative’s number with the brand that sells it', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(articleRead());
      mockTecDocClient.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('OC115'),
      ]);

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/alternative-numbers')
        .expect(200);

      // A chip is a number and a brand, both of which the candidate already
      // carries — so this surface pays for no hydration at all.
      expect(res.body).toEqual([
        { articleNumber: 'OC115', brandName: 'MANN-FILTER' },
      ]);
      expect(mockTecDocClient.getArticleRowsByLegacyIds).not.toHaveBeenCalled();
    });

    it('returns an empty array when nothing replaces the part', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValueOnce(
        articleRead({ ...ARTICLE_DETAIL, oemNumbers: [] }),
      );

      const res = await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/alternative-numbers')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    // One cached candidate set serves both surfaces, so opening either warms the
    // other rather than paying for a second search.
    it('shares the substitutes search', async () => {
      mockTecDocClient.getArticleDetails.mockResolvedValue(articleRead());
      mockTecDocClient.getCrossReferenceCandidates.mockResolvedValue(
        sixCandidates(),
      );

      await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/substitutes')
        .expect(200);
      await request(app.getHttpServer())
        .get('/catalog/brands/30/articles/BD-001/alternative-numbers')
        .expect(200);

      expect(
        mockTecDocClient.getCrossReferenceCandidates,
      ).toHaveBeenCalledTimes(1);
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
