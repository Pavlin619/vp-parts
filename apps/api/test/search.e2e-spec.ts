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

// The execution objects each search mode resolves to (see query-classifier):
// a part number → number search / prefix_or_suffix; the exact toggle → exact
// number match; a descriptive query → free-text (type 99).
const PART = { type: 10, matchType: 'prefix_or_suffix' };
const EXACT = { type: 10, matchType: 'exact' };
const TERM = { type: 99 };

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
    it('returns a one-item list (no redirect) for a single part-number match', async () => {
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
      // A part-number query is a single prefix_or_suffix number call.
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('returns a paginated result list when a part-number query matches multiple articles', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
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

    it('falls back to a free-text (type 99) search over the raw query when the number lane misses', async () => {
      // No brand dictionary in e2e, so brand-stripped == raw: one number call,
      // then the free-text fallback on the same raw query.
      mockTecDocClient.searchArticles
        .mockResolvedValueOnce(pageOf([])) // number lane miss
        .mockResolvedValueOnce(pageOf([makeArticle('OF1')])); // free-text hit

      await request(app.getHttpServer())
        .get('/search?q=oil%20filter%20bosch')
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(2);
      expect(mockTecDocClient.searchArticles).toHaveBeenNthCalledWith(
        1,
        'oil filter bosch',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
      expect(mockTecDocClient.searchArticles).toHaveBeenNthCalledWith(
        2,
        'oil filter bosch',
        undefined,
        TERM,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('routes to an exact number match when the exact toggle is on', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=WL6340&exact=true')
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        EXACT,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('echoes the requested page and pageSize', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340')], { total: 55, page: 2, pageSize: 10 }),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634&page=2&pageSize=10')
        .expect(200);

      expect(res.body.total).toBe(55);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(10);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        2,
        10,
        NO_FILTERS,
      );
    });

    it('scopes the search to the vehicle when a vehicleId is supplied', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340'), makeArticle('WL6341')]),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634&vehicleId=V10001')
        .expect(200);

      const results = res.body.results as Array<{ articleNumber: string }>;
      expect(results.map((r) => r.articleNumber)).toEqual(['WL6340', 'WL6341']);

      // A single number call, scoped to the vehicle — no separate fit lookup.
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL634',
        'V10001',
        PART,
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
        PART,
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

    it('includes autocomplete suggestions when the search returns no results', async () => {
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
