import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import { TecDocClient } from '../src/catalog/tecdoc/tecdoc-client';
import { REDIS_CLIENT } from '../src/catalog/tecdoc/tecdoc-cache.service';
import { ArticleListItemDto, AutocompleteItemDto } from '@vp-parts-shop/shared';

const makeArticle = (
  articleNumber: string,
  description = 'Oil Filter',
): ArticleListItemDto => ({
  articleNumber,
  brandName: 'WIX',
  description,
  thumbnailUrl: null,
  available: false,
  bestPriceExVat: null,
  bestPriceIncVat: null,
});

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
    await redisClient.quit();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await redisClient.flushall();
  });

  describe('GET /search', () => {
    it('redirects to the article page when the exact-match tier returns a single result', async () => {
      mockTecDocClient.searchArticles.mockResolvedValueOnce([
        makeArticle('WL6340'),
      ]);

      const res = await request(app.getHttpServer())
        .get('/search?q=WL6340')
        .expect(200);

      expect(res.body).toEqual({ redirect: '/catalog/articles/WL6340' });
      // Only the exact tier ran — no further TecDoc calls needed
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledTimes(1);
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        'exact',
      );
    });

    it('returns a result list when the prefix-or-suffix tier matches multiple articles', async () => {
      // Tier 1 (exact) misses, tier 2 (prefix_or_suffix) finds two articles
      mockTecDocClient.searchArticles
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeArticle('WL6340'), makeArticle('WL6341')]);

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634')
        .expect(200);

      expect(res.body.query).toBe('WL634');
      expect(res.body.normalisedQuery).toBe('WL634');
      expect(res.body.results).toHaveLength(2);
      // No vehicleId supplied — fitsVehicle is always null
      expect(res.body.results[0].fitsVehicle).toBeNull();
      expect(res.body.results[1].fitsVehicle).toBeNull();
    });

    it('annotates fitsVehicle when a vehicleId is supplied', async () => {
      // Tier 1 misses; tier 2 returns two articles without vehicle scope
      mockTecDocClient.searchArticles
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeArticle('WL6340'), makeArticle('WL6341')])
        // Vehicle-scoped call to determine fitting: only WL6340 fits
        .mockResolvedValueOnce([makeArticle('WL6340')]);

      const res = await request(app.getHttpServer())
        .get('/search?q=WL634&vehicleId=V10001')
        .expect(200);

      const results = res.body.results as Array<{
        articleNumber: string;
        fitsVehicle: boolean;
      }>;
      expect(results).toHaveLength(2);

      const wl6340 = results.find((r) => r.articleNumber === 'WL6340')!;
      const wl6341 = results.find((r) => r.articleNumber === 'WL6341')!;
      expect(wl6340.fitsVehicle).toBe(true);
      expect(wl6341.fitsVehicle).toBe(false);

      // Third call is the vehicle-scoped fitting lookup
      expect(mockTecDocClient.searchArticles).toHaveBeenCalledWith(
        'WL634',
        'V10001',
        'prefix_or_suffix',
      );
    });

    it('includes autocomplete suggestions when all tiers return no results', async () => {
      // 'XYZNOTFOUND' has no brand tokens and no special chars — aggressiveNormalise
      // returns null (identical to standard), so only 2 tiers run.
      mockTecDocClient.searchArticles.mockResolvedValue([]);
      mockTecDocClient.getAutocompleteSuggestions.mockResolvedValueOnce([
        makeSuggestion('XY001'),
        makeSuggestion('XY002'),
      ]);

      const res = await request(app.getHttpServer())
        .get('/search?q=XYZNOTFOUND')
        .expect(200);

      expect(res.body.results).toHaveLength(0);
      expect(res.body.suggestions).toHaveLength(2);
      // SearchService takes the first 5 chars of the normalised query as prefix
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
