import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import { TecDocClient } from '../src/catalog/tecdoc/tecdoc-client';
import { REDIS_CLIENT } from '../src/catalog/tecdoc/tecdoc-cache.service';
import {
  ArticleSummaryDto,
  AttributeFacetDto,
  AutocompleteItemDto,
  CategoryNavigationDto,
  PaginatedSearchArticlesDto,
  SearchFacetDto,
} from '@vp-parts-shop/shared';

const makeArticle = (
  articleNumber: string,
  description = 'Oil Filter',
): ArticleSummaryDto => ({
  articleNumber,
  brandName: 'WIX',
  brandLogoUrl: null,
  description,
  thumbnailUrl: null,
  technicalSpecs: [],
  oemNumbers: [],
  fitsVehicle: null,
});

const pageOf = (
  items: ArticleSummaryDto[],
  overrides: Partial<PaginatedSearchArticlesDto> = {},
): PaginatedSearchArticlesDto => ({
  total: items.length,
  page: 1,
  pageSize: 20,
  items,
  facets: [],
  attributes: [],
  categoryNavigation: { current: null, options: [] },
  ...overrides,
});

// The controller always forwards a filters object; with no brandIds/
// categoryNodeId/attr query params brandIds and categoryNodeId are undefined
// and criteria is an empty array, which the mock is called with.
const NO_FILTERS = {
  brandIds: undefined,
  categoryNodeId: undefined,
  criteria: [],
};

const makeSuggestion = (articleNumber: string): AutocompleteItemDto => ({
  articleNumber,
  brandName: 'WIX',
  description: 'Oil Filter',
});

const mockTecDocClient = {
  getManufacturers: jest.fn(),
  getModelSeries: jest.fn(),
  getVehicleTypes: jest.fn(),
  getAssemblyGroupTree: jest.fn(),
  getBrands: jest.fn(),
  getArticles: jest.fn(),
  getArticleDetails: jest.fn(),
  searchArticles: jest.fn(),
  getAutocompleteSuggestions: jest.fn(),
};

describe('SearchController (e2e)', () => {
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
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // The search flow joins brand logos via getBrands on every non-empty result
    // set; give every test a default so the enrichment resolves.
    mockTecDocClient.getBrands.mockResolvedValue([]);
    await redisClient.flushall();
  });

  describe('GET /search', () => {
    it('returns a one-item list (no redirect) when the exact-match tier returns a single result', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340')]),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL6340')
        .expect(200);

      expect(res.body).not.toHaveProperty('redirect');
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].articleNumber).toBe('WL6340');
      expect(res.body.total).toBe(1);
      // Only the exact tier ran — no further TecDoc calls needed
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        'exact',
        1,
        20,
        NO_FILTERS,
      );
    });

    it('returns a paginated result list when the prefix-or-suffix tier matches multiple articles', async () => {
      // Tier 1 (exact) misses, tier 2 (prefix_or_suffix) finds two articles
      mockTecDocClient.searchArticles
        .mockResolvedValueOnce(pageOf([]))
        .mockResolvedValueOnce(
          pageOf([makeArticle('WL6340'), makeArticle('WL6341')]),
        );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634')
        .expect(200);

      expect(res.body.query).toBe('WL634');
      expect(res.body).not.toHaveProperty('normalisedQuery');
      expect(res.body.results).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      // No vehicleId supplied — fitsVehicle is always null
      expect(res.body.results[0].fitsVehicle).toBeNull();
      expect(res.body.results[1].fitsVehicle).toBeNull();
    });

    it('echoes the requested page and pageSize', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340')], { total: 55, page: 2, pageSize: 10 }),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL&page=2&pageSize=10')
        .expect(200);

      expect(res.body.total).toBe(55);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(10);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL',
        undefined,
        'exact',
        2,
        10,
        NO_FILTERS,
      );
    });

    it('scopes the search to the vehicle when a vehicleId is supplied', async () => {
      // Tier 1 misses; tier 2 returns the parts TecDoc reports as fitting the
      // vehicle. No separate fit lookup runs — the scope is on the search call.
      mockTecDocClient.searchArticles
        .mockResolvedValueOnce(pageOf([]))
        .mockResolvedValueOnce(
          pageOf([makeArticle('WL6340'), makeArticle('WL6341')]),
        );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634&vehicleId=V10001')
        .expect(200);

      const results = res.body.results as Array<{ articleNumber: string }>;
      expect(results.map((r) => r.articleNumber)).toEqual(['WL6340', 'WL6341']);

      // Exactly the two tier calls, both scoped to the vehicle.
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(2);
      expect(mockTecDocClient.searchArticles).toHaveBeenNthCalledWith(
        1,
        'WL634',
        'V10001',
        'exact',
        1,
        20,
        NO_FILTERS,
      );
      expect(mockTecDocClient.searchArticles).toHaveBeenNthCalledWith(
        2,
        'WL634',
        'V10001',
        'prefix_or_suffix',
        1,
        20,
        NO_FILTERS,
      );
    });

    it('returns the brand facet (logos joined), attribute facets and category navigation', async () => {
      const facets: SearchFacetDto[] = [
        {
          id: 'brands',
          label: 'Производител',
          values: [{ id: '4', label: 'WIX', count: 2, imageUrl: null }],
        },
      ];
      const attributes: AttributeFacetDto[] = [
        {
          id: '20',
          label: 'Ширина',
          unit: 'мм',
          type: 'N',
          isInterval: false,
          values: [{ value: '106.4', label: '106.4', count: 2 }],
        },
      ];
      const categoryNavigation: CategoryNavigationDto = {
        current: {
          id: '200',
          label: 'Дискови спирачки',
          count: 2,
          hasChildren: true,
        },
        options: [
          { id: '300', label: 'Накладки', count: 2, hasChildren: false },
        ],
      };
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340'), makeArticle('WL6341')], {
          facets,
          attributes,
          categoryNavigation,
        }),
      );
      mockTecDocClient.getBrands.mockResolvedValue([
        { brandName: 'WIX', logoUrl: 'https://logos/wix.png' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634')
        .expect(200);

      expect(res.body.facets).toEqual([
        {
          id: 'brands',
          label: 'Производител',
          values: [
            {
              id: '4',
              label: 'WIX',
              count: 2,
              imageUrl: 'https://logos/wix.png',
            },
          ],
        },
      ]);
      expect(res.body.attributes).toEqual(attributes);
      expect(res.body.categoryNavigation).toEqual(categoryNavigation);
    });

    it('forwards brandIds, categoryNodeId and attr query params as filters', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340'), makeArticle('WL6341')]),
      );

      await request(app.getHttpServer())
        .get(
          '/search?q=WL634&brandIds=4&brandIds=30&categoryNodeId=200&attr=20:106.4',
        )
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL634',
        undefined,
        'exact',
        1,
        20,
        {
          brandIds: ['4', '30'],
          categoryNodeId: '200',
          criteria: [{ criteriaId: '20', rawValue: '106.4' }],
        },
      );
    });

    it('preserves TecDoc native result order (no client-side ranking)', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('B1'), makeArticle('A2'), makeArticle('C3')]),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634')
        .expect(200);

      const numbers = (
        res.body.results as Array<{ articleNumber: string }>
      ).map((r) => r.articleNumber);
      expect(numbers).toEqual(['B1', 'A2', 'C3']);
    });

    it('returns a single filtered result as a list rather than a redirect', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('OF-WL7090')], {
          facets: [
            {
              id: 'brands',
              label: 'Производител',
              values: [
                {
                  id: 'WIX Filters',
                  label: 'WIX Filters',
                  count: 1,
                  imageUrl: null,
                },
              ],
            },
          ],
        }),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=OF&brandIds=WIX%20Filters')
        .expect(200);

      expect(res.body).not.toHaveProperty('redirect');
      expect(res.body.results).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.facets).toBeDefined();
    });

    it('includes autocomplete suggestions when both tiers return no results', async () => {
      mockTecDocClient.searchArticles.mockResolvedValue(pageOf([]));
      mockTecDocClient.getAutocompleteSuggestions.mockResolvedValueOnce([
        makeSuggestion('XY001'),
        makeSuggestion('XY002'),
      ]);

      const res = await request(app.getHttpServer())
        .get('/search?q=XYZNOTFOUND')
        .expect(200);

      expect(res.body.results).toHaveLength(0);
      expect(res.body.total).toBe(0);
      expect(res.body.suggestions).toHaveLength(2);
      // SearchService takes the first 5 chars of the query as the suggestion prefix
      expect(mockTecDocClient.getAutocompleteSuggestions).toHaveBeenCalledWith(
        'XYZNO',
      );
    });

    it('returns 400 when the q param is missing', async () => {
      await request(app.getHttpServer()).get('/search').expect(400);

      expect(mockTecDocClient.searchArticles).not.toHaveBeenCalled();
    });

    it('returns 400 when the q param is blank', async () => {
      await request(app.getHttpServer()).get('/search?q=%20%20').expect(400);

      expect(mockTecDocClient.searchArticles).not.toHaveBeenCalled();
    });

    it('returns 400 when the q param exceeds 200 characters', async () => {
      const longQuery = 'A'.repeat(201);
      await request(app.getHttpServer())
        .get(`/search?q=${longQuery}`)
        .expect(400);

      expect(mockTecDocClient.searchArticles).not.toHaveBeenCalled();
    });
  });

  describe('GET /search/autocomplete', () => {
    it('returns suggestions for a query of 3 or more characters', async () => {
      const suggestions = [makeSuggestion('WL6340'), makeSuggestion('WL6341')];
      mockTecDocClient.getAutocompleteSuggestions.mockResolvedValueOnce(
        suggestions,
      );

      const res = await request(app.getHttpServer())
        .get('/search/autocomplete?q=WL6')
        .expect(200);

      expect(res.body).toEqual(suggestions);
      expect(mockTecDocClient.getAutocompleteSuggestions).toHaveBeenCalledWith(
        'WL6',
      );
    });

    it('returns an empty list for a query shorter than 3 characters without calling TecDoc', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/autocomplete?q=WL')
        .expect(200);

      expect(res.body).toEqual([]);
      expect(
        mockTecDocClient.getAutocompleteSuggestions,
      ).not.toHaveBeenCalled();
    });

    it('returns an empty list when q is absent without calling TecDoc', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/autocomplete')
        .expect(200);

      expect(res.body).toEqual([]);
      expect(
        mockTecDocClient.getAutocompleteSuggestions,
      ).not.toHaveBeenCalled();
    });
  });
});
