import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { SearchTecDoc } from '../src/search';
import { BrandsTecDoc } from '../src/catalog';
import { REDIS_CLIENT } from '../src/redis';
import {
  ArticleSummaryDto,
  ArticleAutocompleteItemDto,
  AttributeFacetDto,
  CategoryNavigationDto,
  PaginatedSearchArticlesDto,
  SearchFacetDto,
  TermAutocompleteItemDto,
} from '@vp-parts-shop/shared';

const makeArticle = (
  articleNumber: string,
  description = 'Oil Filter',
): ArticleSummaryDto => ({
  articleNumber,
  brandId: '268',
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

// The execution objects each searchMode resolves to (see buildSearchPlan):
// part_number → number search / prefix_or_suffix; part_number_exact → exact
// number match; generic → free-text (type 99).
const PART = { type: 10, matchType: 'prefix_or_suffix' };
const EXACT = { type: 10, matchType: 'exact' };
const TERM = { type: 99 };

// The article-autocomplete executions each mode resolves to (see
// SearchService.autocomplete): part_number → prefix, part_number_exact → exact.
const AC_PREFIX = { type: 10, matchType: 'prefix' };
const AC_EXACT = { type: 10, matchType: 'exact' };

const makeSuggestion = (articleNumber: string): ArticleAutocompleteItemDto => ({
  kind: 'article',
  articleNumber,
  brandId: '268',
  brandName: 'WIX',
  description: 'Oil Filter',
});

const makeTerm = (term: string): TermAutocompleteItemDto => ({
  kind: 'term',
  term,
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
  getAutocompleteArticles: jest.fn(),
  getAutocompleteTerms: jest.fn(),
};

describe('SearchController (e2e)', () => {
  let app: INestApplication;
  let redisClient: Redis;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(SearchTecDoc).useValue(mockTecDocClient);
      builder.overrideProvider(BrandsTecDoc).useValue(mockTecDocClient);
    });
    redisClient = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    resetRateLimits(app);
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

    it('does not fall back to free-text in part-number mode when the number lane misses', async () => {
      mockTecDocClient.searchArticles.mockResolvedValue(pageOf([]));
      mockTecDocClient.getAutocompleteArticles.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/search?q=oil%20filter%20bosch')
        .expect(200);

      // No brand dictionary in e2e, so brand-stripped == raw: a single number
      // call, and no free-text fallback in the default mode.
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'oil filter bosch',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('issues a single free-text (type 99) call in generic mode', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('OF1')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=oil%20filter%20bosch&searchMode=generic')
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'oil filter bosch',
        undefined,
        TERM,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('routes to an exact number match when searchMode is part_number_exact', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=WL6340&searchMode=part_number_exact')
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        EXACT,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('returns 400 for an unsupported searchMode', async () => {
      await request(app.getHttpServer())
        .get('/search?q=WL6340&searchMode=fuzzy')
        .expect(400);

      expect(mockTecDocClient.searchArticles).not.toHaveBeenCalled();
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
        .get('/search?q=WL634&vehicleId=10001')
        .expect(200);

      const results = res.body.results as Array<{ articleNumber: string }>;
      expect(results.map((r) => r.articleNumber)).toEqual(['WL6340', 'WL6341']);

      // A single number call, scoped to the vehicle — no separate fit lookup.
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL634',
        10001,
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
          // The facet value id is the brand id, which is what the logo joins on.
          values: [{ id: '268', label: 'WIX', count: 2, imageUrl: null }],
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
        { brandId: '268', brandName: 'WIX', logoUrl: 'https://logos/wix.png' },
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
              id: '268',
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
          brandIds: [4, 30],
          categoryNodeId: 200,
          criteria: [{ criteriaId: 20, rawValue: '106.4' }],
        },
      );
    });

    it('forwards the categoryHasChildren leaf hint as a filter', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=WL634&categoryNodeId=200&categoryHasChildren=true')
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        1,
        20,
        expect.objectContaining({
          categoryNodeId: 200,
          categoryHasChildren: true,
        }),
      );
    });

    it('ignores an unparseable leaf hint rather than rejecting the search', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=WL634&categoryNodeId=200&categoryHasChildren=maybe')
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        1,
        20,
        expect.objectContaining({ categoryHasChildren: undefined }),
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
                  id: '4',
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
        .get('/search?q=OF&brandIds=4')
        .expect(200);

      expect(res.body).not.toHaveProperty('redirect');
      expect(res.body.results).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.facets).toBeDefined();
    });

    it('includes autocomplete suggestions when the search returns no results', async () => {
      mockTecDocClient.searchArticles.mockResolvedValue(pageOf([]));
      mockTecDocClient.getAutocompleteArticles.mockResolvedValueOnce([
        makeSuggestion('XY001'),
        makeSuggestion('XY002'),
      ]);

      const res = await request(app.getHttpServer())
        .get('/search?q=XYZNOTFOUND')
        .expect(200);

      expect(res.body.results).toHaveLength(0);
      expect(res.body.total).toBe(0);
      expect(res.body.suggestions).toHaveLength(2);
      // Recovery is always an article-prefix lookup over the first 5 chars.
      expect(mockTecDocClient.getAutocompleteArticles).toHaveBeenCalledWith(
        'XYZNO',
        AC_PREFIX,
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

    // The ids reach TecDoc as numbers, so an unparseable one would serialise to
    // `null` and drop the filter — widening the search instead of failing it.
    // Rejecting at the boundary is what lets everything downstream take a
    // number on trust.
    it.each([
      ['vehicleId', '/search?q=WL634&vehicleId=abc'],
      ['vehicleId', '/search?q=WL634&vehicleId=0'],
      ['categoryNodeId', '/search?q=WL634&categoryNodeId=1.5'],
      ['brandIds', '/search?q=WL634&brandIds=4&brandIds=bosch'],
    ])('returns 400 for an unparseable %s', async (_property, url) => {
      await request(app.getHttpServer()).get(url).expect(400);

      expect(mockTecDocClient.searchArticles).not.toHaveBeenCalled();
    });
  });

  // A two-lane plan only exists for a part-number query whose brand token was
  // stripped, so these tests give the app a brand dictionary and search
  // "WIX WA5432": lane 1 is the bare number, lane 2 the raw query.
  describe('GET /search — lane resolution', () => {
    const RAW_QUERY = 'WIX WA5432';
    const STRIPPED_QUERY = 'WA5432';
    const SEARCH_URL = '/search?q=WIX%20WA5432';

    beforeEach(() => {
      mockTecDocClient.getBrands.mockResolvedValue([
        { brandName: 'WIX Filters', logoUrl: null },
      ]);
    });

    async function primeLaneWithRawQueryWinner(): Promise<void> {
      mockTecDocClient.searchArticles
        .mockResolvedValueOnce(pageOf([])) // WA5432 misses
        .mockResolvedValueOnce(pageOf([makeArticle('WA5432')])); // raw wins

      await request(app.getHttpServer()).get(SEARCH_URL).expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(2);
      mockTecDocClient.searchArticles.mockReset();
    }

    /**
     * Answers each lane independently, and separately for the unnarrowed probe
     * and the narrowed request, so a test can state exactly which combination
     * has matches — the only way to tell a resolved lane from a crossed one.
     */
    function respondPerLane(
      unnarrowed: Record<string, ArticleSummaryDto[]>,
      narrowed: Record<string, ArticleSummaryDto[]> = {},
    ): void {
      // Authoritative: drops any queued one-shot answers so the lane tables
      // below are the only thing deciding what a call returns.
      mockTecDocClient.searchArticles.mockReset();
      mockTecDocClient.searchArticles.mockImplementation(
        (
          query: string,
          _vehicleId: string | undefined,
          _execution: unknown,
          _page: number,
          _pageSize: number,
          filters: { brandIds?: number[]; categoryNodeId?: number },
        ) => {
          const isNarrowed = Boolean(
            filters.brandIds?.length ?? filters.categoryNodeId,
          );

          return Promise.resolve(
            pageOf((isNarrowed ? narrowed : unnarrowed)[query] ?? []),
          );
        },
      );
    }

    /**
     * Drops the cached search pages but keeps the lane memo, reproducing the
     * real stale window: a lane's pages are held under the five-minute miss TTL
     * (or evicted under memory pressure) while the memo is pinned for an hour.
     */
    async function expireSearchPagesKeepingLaneMemo(): Promise<void> {
      const keys = await redisClient.keys('tecdoc:search:*');
      const pages = keys.filter(
        (key) => !key.startsWith('tecdoc:search:lane:'),
      );

      if (pages.length > 0) {
        await redisClient.del(...pages);
      }
    }

    it('pins the winning lane so a faceted refinement costs one catalogue call', async () => {
      await primeLaneWithRawQueryWinner();
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WA5432')]),
      );

      await request(app.getHttpServer())
        .get(`${SEARCH_URL}&brandIds=4`)
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        RAW_QUERY,
        undefined,
        PART,
        1,
        20,
        { ...NO_FILTERS, brandIds: [4] },
      );
    });

    it('pins the winning lane across pages', async () => {
      await primeLaneWithRawQueryWinner();
      mockTecDocClient.searchArticles.mockResolvedValueOnce(
        pageOf([makeArticle('WA5432')], { total: 87, page: 3 }),
      );

      await request(app.getHttpServer())
        .get(`${SEARCH_URL}&page=3`)
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        RAW_QUERY,
        undefined,
        PART,
        3,
        20,
        NO_FILTERS,
      );
    });

    // The facets came from the pinned lane, so a combination that empties it is
    // genuinely empty — answering from the other lane would show articles the
    // user's selection was never derived from.
    it('answers an emptied lane with no results rather than crossing lanes', async () => {
      await primeLaneWithRawQueryWinner();
      respondPerLane(
        { [RAW_QUERY]: [makeArticle('WA5432')] },
        { [STRIPPED_QUERY]: [makeArticle('OTHER-LANE')] },
      );
      mockTecDocClient.getAutocompleteArticles.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get(`${SEARCH_URL}&brandIds=4&categoryNodeId=100`)
        .expect(200);

      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(res.body.results).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    // Which lane a query belongs to must not depend on what Redis happens to
    // hold. A narrowed request arriving cold — a shared link, a fresh deploy,
    // an eviction — has to resolve the same lane an unnarrowed one would,
    // otherwise it answers from a lane the user's facets never came from.
    it('resolves the lane from an unnarrowed probe when a narrowed request arrives cold', async () => {
      respondPerLane(
        { [RAW_QUERY]: [makeArticle('WA5432')] },
        { [STRIPPED_QUERY]: [makeArticle('WRONG-LANE')] },
      );
      mockTecDocClient.getAutocompleteArticles.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get(`${SEARCH_URL}&brandIds=4`)
        .expect(200);

      expect(res.body.results).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(mockTecDocClient.searchArticles).not.toHaveBeenCalledWith(
        STRIPPED_QUERY,
        undefined,
        PART,
        1,
        20,
        { ...NO_FILTERS, brandIds: [4] },
      );
    });

    // A memo outliving the matches it was written for must cost a slower probe,
    // never a wrong answer.
    it('re-resolves the lane when the memoised one has stopped matching', async () => {
      await primeLaneWithRawQueryWinner();
      await expireSearchPagesKeepingLaneMemo();
      respondPerLane({ [STRIPPED_QUERY]: [makeArticle('BACK-ON-LANE-ONE')] });

      const res = await request(app.getHttpServer())
        .get(SEARCH_URL)
        .expect(200);

      expect(res.body.results).toEqual([makeArticle('BACK-ON-LANE-ONE')]);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /search/autocomplete', () => {
    it('returns article suggestions for a part-number query (default mode)', async () => {
      const suggestions = [makeSuggestion('WL6340'), makeSuggestion('WL6341')];
      mockTecDocClient.getAutocompleteArticles.mockResolvedValueOnce(
        suggestions,
      );

      const res = await request(app.getHttpServer())
        .get('/search/autocomplete?q=WL6')
        .expect(200);

      expect(res.body).toEqual(suggestions);
      expect(mockTecDocClient.getAutocompleteArticles).toHaveBeenCalledWith(
        'WL6',
        AC_PREFIX,
      );
      expect(mockTecDocClient.getAutocompleteTerms).not.toHaveBeenCalled();
    });

    it('runs an exact article lookup when searchMode is part_number_exact', async () => {
      mockTecDocClient.getAutocompleteArticles.mockResolvedValueOnce([
        makeSuggestion('WL6340'),
      ]);

      await request(app.getHttpServer())
        .get('/search/autocomplete?q=WL6340&searchMode=part_number_exact')
        .expect(200);

      expect(mockTecDocClient.getAutocompleteArticles).toHaveBeenCalledWith(
        'WL6340',
        AC_EXACT,
      );
    });

    it('returns term suggestions from getAutoCompleteSuggestions in generic mode', async () => {
      const terms = [makeTerm('Oil Filter'), makeTerm('Oil Filter Housing')];
      mockTecDocClient.getAutocompleteTerms.mockResolvedValueOnce(terms);

      const res = await request(app.getHttpServer())
        .get('/search/autocomplete?q=oil&searchMode=generic')
        .expect(200);

      expect(res.body).toEqual(terms);
      expect(mockTecDocClient.getAutocompleteTerms).toHaveBeenCalledWith('oil');
      expect(mockTecDocClient.getAutocompleteArticles).not.toHaveBeenCalled();
    });

    it('returns 400 for an unsupported searchMode', async () => {
      await request(app.getHttpServer())
        .get('/search/autocomplete?q=WL6&searchMode=fuzzy')
        .expect(400);

      expect(mockTecDocClient.getAutocompleteArticles).not.toHaveBeenCalled();
      expect(mockTecDocClient.getAutocompleteTerms).not.toHaveBeenCalled();
    });

    it('returns an empty list for a query shorter than 3 characters without calling TecDoc', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/autocomplete?q=WL')
        .expect(200);

      expect(res.body).toEqual([]);
      expect(mockTecDocClient.getAutocompleteArticles).not.toHaveBeenCalled();
    });

    it('returns an empty list when q is absent without calling TecDoc', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/autocomplete')
        .expect(200);

      expect(res.body).toEqual([]);
      expect(mockTecDocClient.getAutocompleteArticles).not.toHaveBeenCalled();
    });
  });
});
