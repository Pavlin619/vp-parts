import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { SearchTecDoc } from '../src/search';
import { SearchEnumeration } from '../src/search/search-enumeration';
import { SEARCH_MAX_PAGE } from '../src/search/search.dto';
import { ArticleRowsTecDoc, BrandsTecDoc } from '../src/catalog';
import { ArticleCandidate, ArticleStatus } from '../src/tecdoc';
import { REDIS_CLIENT } from '../src/redis';
import {
  ArticleSummaryDto,
  ArticleAutocompleteItemDto,
  AttributeFacetDto,
  CategoryNavigationDto,
  SearchFacetDto,
  SearchSort,
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
  fitsVehicle: null,
});

const makeArticles = (count: number): ArticleSummaryDto[] =>
  Array.from({ length: count }, (_unused, index) =>
    makeArticle(`WL${6000 + index}`),
  );

// The row each minted legacy id hydrates back to, so a search reads its page
// the way production does: enumerate identities, then buy the rows for the page
// a visitor reached. Cleared per test alongside the Redis cache.
const rowByLegacyId = new Map<number, ArticleSummaryDto>();
let nextLegacyId = 1;

const candidateOf = (row: ArticleSummaryDto): ArticleCandidate => {
  const legacyArticleId = nextLegacyId++;
  rowByLegacyId.set(legacyArticleId, row);

  return {
    brandId: row.brandId,
    brandName: row.brandName,
    articleNumber: row.articleNumber,
    description: row.description,
    legacyArticleIds: [legacyArticleId],
    articleStatusId: ArticleStatus.Normal,
  };
};

const enumerationOf = (
  items: ArticleSummaryDto[],
  overrides: Partial<SearchEnumeration> = {},
): SearchEnumeration => ({
  total: items.length,
  candidates: items.map(candidateOf),
  facets: [],
  attributes: [],
  categoryNavigation: { current: null, ancestors: [], options: [] },
  ...overrides,
});

// The controller always forwards a filters object; with no brandIds/
// productTypeIds/categoryNodeId/attr query params the selections are undefined
// and criteria is an empty array, which the mock is called with.
const NO_FILTERS = {
  brandIds: undefined,
  productTypeIds: undefined,
  categoryNodeId: undefined,
  criteria: [],
};

// The execution objects each searchMode resolves to (see searchCallFor):
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
  enumerate: jest.fn(),
  readRowsPage: jest.fn(),
  getArticleRowsByLegacyIds: jest.fn(),
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
      builder.overrideProvider(ArticleRowsTecDoc).useValue(mockTecDocClient);
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
    // Hydration answers each candidate with the row it was minted from, so a
    // test states its fixture once, as articles.
    rowByLegacyId.clear();
    mockTecDocClient.getArticleRowsByLegacyIds.mockImplementation(
      (legacyArticleIds: number[]) =>
        Promise.resolve(
          legacyArticleIds
            .map((legacyArticleId) => rowByLegacyId.get(legacyArticleId))
            .filter((row): row is ArticleSummaryDto => row !== undefined),
        ),
    );
    await redisClient.flushall();
  });

  describe('GET /search', () => {
    it('returns a one-item list (no redirect) for a single part-number match', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340')]),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL6340')
        .expect(200);

      expect(res.body).not.toHaveProperty('redirect');
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].articleNumber).toBe('WL6340');
      expect(res.body.total).toBe(1);
      // A part-number query is a single prefix_or_suffix number call.
      expect(mockTecDocClient.enumerate).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        PART,
        NO_FILTERS,
      );
    });

    it('returns a paginated result list when a part-number query matches multiple articles', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340'), makeArticle('WL6341')]),
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

    it('does not fall back to free-text in part-number mode when the number misses', async () => {
      mockTecDocClient.enumerate.mockResolvedValue(enumerationOf([]));
      mockTecDocClient.getAutocompleteArticles.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/search?q=oil%20filter%20bosch')
        .expect(200);

      // No brand dictionary here, so brand-stripped == raw: a single number
      // call, and no free-text fallback in the default mode.
      expect(mockTecDocClient.enumerate).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'oil filter bosch',
        undefined,
        PART,
        NO_FILTERS,
      );
    });

    it('issues a single free-text (type 99) call in generic mode', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('OF1')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=oil%20filter%20bosch&searchMode=generic')
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'oil filter bosch',
        undefined,
        TERM,
        NO_FILTERS,
      );
    });

    it('routes to an exact number match when searchMode is part_number_exact', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=WL6340&searchMode=part_number_exact')
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        EXACT,
        NO_FILTERS,
      );
    });

    it('returns 400 for an unsupported searchMode', async () => {
      await request(app.getHttpServer())
        .get('/search?q=WL6340&searchMode=fuzzy')
        .expect(400);

      expect(mockTecDocClient.enumerate).not.toHaveBeenCalled();
    });

    it('serves the order the sort param asks for and echoes it back', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('Z-LAST'), makeArticle('A-FIRST')]),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634&sort=article_number')
        .expect(200);

      expect(
        (res.body.results as Array<{ articleNumber: string }>).map(
          (result) => result.articleNumber,
        ),
      ).toEqual(['A-FIRST', 'Z-LAST']);
      expect(res.body.ordering).toBe(SearchSort.ArticleNumber);
      expect(res.body.isRankable).toBe(true);
    });

    it('returns 400 for an order it does not offer', async () => {
      await request(app.getHttpServer())
        .get('/search?q=WL6340&sort=cheapest')
        .expect(400);

      expect(mockTecDocClient.enumerate).not.toHaveBeenCalled();
    });

    it('serves the requested slice of the ranked set and echoes the paging', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf(makeArticles(55)),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634&page=2&pageSize=10')
        .expect(200);

      expect(res.body.total).toBe(55);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(10);
      expect(res.body.maxPage).toBe(6);
      expect(res.body.results).toHaveLength(10);
      expect(res.body.ordering).toBe('availability');
      // The set is read once, page-free, and cut into pages here.
      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        NO_FILTERS,
      );
      expect(mockTecDocClient.readRowsPage).not.toHaveBeenCalled();
    });

    // Past the sortable limit the set is served in TecDoc's own order, and the
    // pager is sized from what TecDoc will actually serve — which is not
    // derivable from the total: it stops well before a broad match set runs out.
    it('falls back to the catalogue order for a set too wide to rank', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([], { total: 50_000 }),
      );
      mockTecDocClient.readRowsPage.mockResolvedValueOnce({
        items: [makeArticle('WL6340')],
        maxAllowedPage: 500,
      });

      const res = await request(app.getHttpServer())
        .get('/search?q=филтър&searchMode=generic')
        .expect(200);

      expect(res.body.total).toBe(50_000);
      expect(res.body.maxPage).toBe(500);
      expect(res.body.ordering).toBe('catalogue');
      expect(res.body.isRankable).toBe(false);
      expect(res.body.results).toHaveLength(1);
      expect(mockTecDocClient.readRowsPage).toHaveBeenCalledWith({
        query: 'филтър',
        vehicleId: undefined,
        execution: TERM,
        page: 1,
        pageSize: 20,
        sort: SearchSort.Availability,
        filters: NO_FILTERS,
      });
    });

    it('scopes the search to the vehicle when a vehicleId is supplied', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340'), makeArticle('WL6341')]),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634&vehicleId=10001')
        .expect(200);

      const results = res.body.results as Array<{ articleNumber: string }>;
      expect(results.map((r) => r.articleNumber)).toEqual(['WL6340', 'WL6341']);

      // A single number call, scoped to the vehicle — no separate fit lookup.
      expect(mockTecDocClient.enumerate).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'WL634',
        10001,
        PART,
        NO_FILTERS,
      );
    });

    it('returns the brand facet (logos joined), attribute facets and category navigation', async () => {
      const facets: SearchFacetDto[] = [
        {
          id: 'brands',
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
          isMandatory: true,
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
        ancestors: [
          { id: '100', label: 'Спирачна система', count: 2, hasChildren: true },
        ],
        options: [
          { id: '300', label: 'Накладки', count: 2, hasChildren: false },
        ],
      };
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340'), makeArticle('WL6341')], {
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
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340'), makeArticle('WL6341')]),
      );

      await request(app.getHttpServer())
        .get(
          '/search?q=WL634&brandIds=4&brandIds=30&categoryNodeId=200&attr=20:106.4',
        )
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        {
          brandIds: [4, 30],
          categoryNodeId: 200,
          criteria: [{ criteriaId: 20, rawValue: '106.4' }],
        },
      );
    });

    it('forwards productTypeIds as a filter', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=филтър&productTypeIds=7&productTypeIds=9')
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'филтър',
        undefined,
        PART,
        expect.objectContaining({ productTypeIds: [7, 9] }),
      );
    });

    // Product types have no logo, so the brand join must leave them alone —
    // even though their ids live in the same `facets` array.
    it('returns the product-type facet without stamping a brand logo on it', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340')], {
          facets: [
            {
              id: 'productTypes',
              values: [{ id: '268', label: 'Маслен филтър', count: 1 }],
            },
          ],
        }),
      );
      mockTecDocClient.getBrands.mockResolvedValue([
        { brandId: '268', brandName: 'WIX', logoUrl: 'https://logos/wix.png' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/search?q=филтър')
        .expect(200);

      expect(res.body.facets).toEqual([
        {
          id: 'productTypes',
          values: [{ id: '268', label: 'Маслен филтър', count: 1 }],
        },
      ]);
    });

    it('forwards the categoryHasChildren leaf hint as a filter', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=WL634&categoryNodeId=200&categoryHasChildren=true')
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        expect.objectContaining({
          categoryNodeId: 200,
          categoryHasChildren: true,
        }),
      );
    });

    it('ignores an unparseable leaf hint rather than rejecting the search', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get('/search?q=WL634&categoryNodeId=200&categoryHasChildren=maybe')
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        expect.objectContaining({ categoryHasChildren: undefined }),
      );
    });

    // A set we can rank is re-ordered rather than served as TecDoc sorted it.
    // Nothing is in stock in this suite, so what is asserted here is the last
    // tiebreak — catalogue order, which is what makes paging deterministic.
    it('ranks a set it can rank instead of keeping TecDoc order', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([
          makeArticle('B1'),
          makeArticle('A2'),
          makeArticle('C3'),
        ]),
      );

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634')
        .expect(200);

      const numbers = (
        res.body.results as Array<{ articleNumber: string }>
      ).map((r) => r.articleNumber);
      expect(numbers).toEqual(['A2', 'B1', 'C3']);
      expect(res.body.ordering).toBe('availability');
    });

    it('returns a single filtered result as a list rather than a redirect', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('OF-WL7090')], {
          facets: [
            {
              id: 'brands',
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
      mockTecDocClient.enumerate.mockResolvedValue(enumerationOf([]));
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

      expect(mockTecDocClient.enumerate).not.toHaveBeenCalled();
    });

    it('returns 400 when the q param is blank', async () => {
      await request(app.getHttpServer()).get('/search?q=%20%20').expect(400);

      expect(mockTecDocClient.enumerate).not.toHaveBeenCalled();
    });

    it('returns 400 when the q param exceeds 200 characters', async () => {
      const longQuery = 'A'.repeat(201);
      await request(app.getHttpServer())
        .get(`/search?q=${longQuery}`)
        .expect(400);

      expect(mockTecDocClient.enumerate).not.toHaveBeenCalled();
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

      expect(mockTecDocClient.enumerate).not.toHaveBeenCalled();
    });

    // Past TecDoc's own ~10,000-result paging ceiling the call can only come
    // back a rejection, which the transport raises as a 5xx. Refusing it here
    // keeps a URL-edited page number from costing an upstream call and a Redis
    // key per attempt.
    it.each([
      ['just past the ceiling', SEARCH_MAX_PAGE + 1],
      ['absurd', 9_999_999],
    ])('returns 400 for a page %s', async (_case, page) => {
      await request(app.getHttpServer())
        .get(`/search?q=WL634&page=${page}`)
        .expect(400);

      expect(mockTecDocClient.enumerate).not.toHaveBeenCalled();
    });

    it('accepts the highest page TecDoc can serve', async () => {
      mockTecDocClient.enumerate.mockResolvedValue(
        enumerationOf([makeArticle('WL6340')]),
      );

      await request(app.getHttpServer())
        .get(`/search?q=WL634&page=${SEARCH_MAX_PAGE}`)
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalled();
    });
  });

  // The rest of the suite runs without a brand dictionary, so the parser has
  // nothing to strip and the query reaches TecDoc as typed. These give the app
  // a dictionary and search "WIX WA5432" to cover the rewrite end to end.
  describe('GET /search — brand stripping', () => {
    const STRIPPED_QUERY = 'WA5432';
    const SEARCH_URL = '/search?q=WIX%20WA5432';

    beforeEach(() => {
      mockTecDocClient.getBrands.mockResolvedValue([
        { brandName: 'WIX Filters', logoUrl: null },
      ]);
    });

    it('searches the bare number when the query carries a brand token', async () => {
      mockTecDocClient.enumerate.mockResolvedValueOnce(
        enumerationOf([makeArticle('WA5432')]),
      );

      const res = await request(app.getHttpServer())
        .get(SEARCH_URL)
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        STRIPPED_QUERY,
        undefined,
        PART,
        NO_FILTERS,
      );
      expect(res.body.results).toEqual([makeArticle('WA5432')]);
    });

    // TecDoc reads a whole number query as one number, so the query as typed
    // matches nothing a stripped one would not. A miss is a miss.
    it('does not retry the query as typed when the bare number misses', async () => {
      mockTecDocClient.enumerate.mockResolvedValue(enumerationOf([]));
      mockTecDocClient.getAutocompleteArticles.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get(SEARCH_URL)
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledTimes(1);
      expect(res.body.total).toBe(0);
    });

    it('keeps searching the bare number when the visitor narrows the results', async () => {
      mockTecDocClient.enumerate.mockResolvedValue(
        enumerationOf([makeArticle('WA5432')]),
      );

      await request(app.getHttpServer()).get(SEARCH_URL).expect(200);
      mockTecDocClient.enumerate.mockClear();

      await request(app.getHttpServer())
        .get(`${SEARCH_URL}&brandIds=4`)
        .expect(200);

      expect(mockTecDocClient.enumerate).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.enumerate).toHaveBeenCalledWith(
        STRIPPED_QUERY,
        undefined,
        PART,
        { ...NO_FILTERS, brandIds: [4] },
      );
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
