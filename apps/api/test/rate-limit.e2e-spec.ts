import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ArticleSummaryDto } from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { SearchTecDoc } from '../src/search';
import { SearchEnumeration } from '../src/search/search-enumeration';
import { ArticleRowsTecDoc, BrandsTecDoc } from '../src/catalog';
import { ArticleStatus } from '../src/tecdoc';

const WEB_ORIGIN_TOKEN = 'web-origin-secret-for-tests';

/** Matches the limit SearchController puts on GET /search. */
const SEARCH_RATE_LIMIT = 30;

const ARTICLE: ArticleSummaryDto = {
  articleNumber: 'WL6340',
  brandId: '268',
  brandName: 'WIX',
  brandLogoUrl: null,
  description: 'Oil Filter',
  thumbnailUrl: null,
  technicalSpecs: [],
  fitsVehicle: null,
};

const LEGACY_ARTICLE_ID = 777;

// A hit, since a miss would take the did-you-mean path and need its own mocks.
const ONE_HIT: SearchEnumeration = {
  total: 1,
  candidates: [
    {
      brandId: ARTICLE.brandId,
      brandName: ARTICLE.brandName,
      articleNumber: ARTICLE.articleNumber,
      description: ARTICLE.description,
      legacyArticleIds: [LEGACY_ARTICLE_ID],
      articleStatusId: ArticleStatus.Normal,
    },
  ],
  facets: [],
  attributes: [],
  categoryNavigation: { current: null, ancestors: [], options: [] },
};

const mockTecDocClient = {
  getManufacturers: jest.fn(),
  getModelSeries: jest.fn(),
  getVehicleTypes: jest.fn(),
  getAssemblyGroupTree: jest.fn(),
  getBrands: jest.fn().mockResolvedValue([]),
  getArticles: jest.fn(),
  getArticleDetails: jest.fn(),
  enumerate: jest.fn().mockResolvedValue(ONE_HIT),
  readRowsPage: jest.fn(),
  getArticleRowsByLegacyIds: jest.fn().mockResolvedValue([ARTICLE]),
  getAutocompleteArticles: jest.fn(),
  getAutocompleteTerms: jest.fn(),
};

/**
 * Covers the wiring, not the arithmetic: `resolveClientIp` is unit tested, but
 * nothing else proves the throttler actually calls it. Reading
 * `X-RateLimit-Remaining` rather than driving requests to a 429 keeps it cheap.
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  const searchAs = (forwardedFor: string, token = WEB_ORIGIN_TOKEN) =>
    request(app.getHttpServer())
      .get('/search?q=WL6340')
      .set('x-forwarded-for', forwardedFor)
      .set('x-web-origin-token', token);

  const remainingAfter = async (...args: Parameters<typeof searchAs>) => {
    const response = await searchAs(...args).expect(200);

    return Number(response.headers['x-ratelimit-remaining']);
  };

  beforeAll(async () => {
    // Read when the module compiles, so both must be set before the app builds.
    process.env.WEB_ORIGIN_TOKEN = WEB_ORIGIN_TOKEN;
    process.env.TRUSTED_PROXY_COUNT = '1';

    app = await createTestApp((builder) => {
      builder.overrideProvider(SearchTecDoc).useValue(mockTecDocClient);
      builder.overrideProvider(BrandsTecDoc).useValue(mockTecDocClient);
      builder.overrideProvider(ArticleRowsTecDoc).useValue(mockTecDocClient);
    });
  });

  afterAll(async () => {
    await app.close();
    delete process.env.WEB_ORIGIN_TOKEN;
    delete process.env.TRUSTED_PROXY_COUNT;
  });

  beforeEach(() => {
    resetRateLimits(app);
  });

  it('applies the search-specific limit rather than the site-wide one', async () => {
    expect(await remainingAfter('203.0.113.7, 76.76.21.1')).toBe(
      SEARCH_RATE_LIMIT - 1,
    );
  });

  it('spends one allowance per visitor, not one for the whole frontend', async () => {
    // Both arrive from the same Vercel egress address; only the forwarded
    // browser address tells them apart.
    await remainingAfter('203.0.113.7, 76.76.21.1');

    expect(await remainingAfter('198.51.100.4, 76.76.21.1')).toBe(
      SEARCH_RATE_LIMIT - 1,
    );
  });

  it('ignores a declared address from a caller without the shared secret', async () => {
    // Attributed to what our proxy appended, so rotating the header cannot buy
    // a fresh bucket per request.
    await remainingAfter('203.0.113.7, 198.51.100.9', 'wrong-token');

    expect(await remainingAfter('1.2.3.4, 198.51.100.9', 'wrong-token')).toBe(
      SEARCH_RATE_LIMIT - 2,
    );
  });
});
