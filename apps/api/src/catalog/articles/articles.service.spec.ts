import { NotFoundException } from '@nestjs/common';
import {
  ArticleSummaryDto,
  ArticleInventoryDetailDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { InventoryService } from '../../inventory';
import { CatalogUnavailableException } from '../../tecdoc';
import { BrandsService } from '../brands';
import { ArticleNotFoundException } from './article-not-found.exception';
import { ArticlesTecDoc } from './articles.tecdoc';
import { ArticlesService } from './articles.service';
import { LinkedVehiclesService } from './linked-vehicles';

const BOSCH = 30;

function item(
  articleNumber: string,
  overrides: Partial<ArticleSummaryDto> = {},
): ArticleSummaryDto {
  return {
    articleNumber,
    brandId: String(BOSCH),
    brandName: 'Bosch',
    brandLogoUrl: null,
    description: 'Part',
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
    ...overrides,
  };
}

/** A `getArticles` answer: mapped rows plus the linkage roles beside them. */
function catalogPage(items: ArticleSummaryDto[]) {
  return {
    articles: { total: items.length, page: 1, pageSize: 20, items },
    roles: items.map((row) => ({
      brandId: row.brandId,
      articleNumber: row.articleNumber,
      legacyArticleIds: [555],
    })),
  };
}

describe('ArticlesService', () => {
  let tecdoc: {
    getArticles: jest.Mock;
    getArticleDetails: jest.Mock;
    getComparableArticles: jest.Mock;
  };
  let cache: { cached: jest.Mock; cachedArray: jest.Mock };
  let brands: { attachLogos: jest.Mock };
  let inventory: { getAvailability: jest.Mock };
  let linkedVehicles: { rememberLinkageRoles: jest.Mock };
  let service: ArticlesService;

  beforeEach(() => {
    tecdoc = {
      getArticles: jest.fn(),
      getArticleDetails: jest.fn(),
      getComparableArticles: jest.fn(),
    };
    cache = {
      cached: jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
        loader(),
      ),
      cachedArray: jest.fn(
        (_key: string, _hit: number, _miss: number, loader: () => unknown) =>
          loader(),
      ),
    };
    // attachLogos is an identity passthrough here; the join itself is covered
    // in the BrandsService spec.
    brands = {
      attachLogos: jest.fn((items: unknown) => Promise.resolve(items)),
    };
    inventory = { getAvailability: jest.fn() };
    linkedVehicles = {
      rememberLinkageRoles: jest.fn().mockResolvedValue(undefined),
    };

    service = new ArticlesService(
      tecdoc as unknown as ArticlesTecDoc,
      cache as unknown as RedisCache,
      brands as unknown as BrandsService,
      inventory as unknown as InventoryService,
      linkedVehicles as unknown as LinkedVehiclesService,
    );
  });

  describe('listArticleMetadata', () => {
    it('caches by vehicle/category/page/size for 24h and joins brand logos', async () => {
      tecdoc.getArticles.mockResolvedValueOnce(catalogPage([item('A1')]));

      const result = await service.listArticleMetadata(10001, 100002, 1, 20);

      expect(cache.cached).toHaveBeenCalledWith(
        'tecdoc:articles:10001:100002:1:20',
        24 * 60 * 60,
        expect.any(Function),
      );
      expect(brands.attachLogos).toHaveBeenCalledWith([item('A1')]);
      expect(result.items).toEqual([item('A1')]);
    });

    // The listing response already carries the ids the applicable-vehicles
    // section is keyed by. Handing them over is what keeps that section from
    // re-reading the article the first time a visitor expands a row; which key
    // they land under is the owning service's business, not this one's.
    it('hands every row’s linkage roles to the vehicles section', async () => {
      const page = catalogPage([item('A1'), item('A2')]);
      tecdoc.getArticles.mockResolvedValueOnce(page);

      await service.listArticleMetadata(10001, 100002, 1, 20);

      expect(linkedVehicles.rememberLinkageRoles).toHaveBeenCalledWith(
        page.roles,
      );
    });

    // Warming belongs inside the loader: on a hit the memos are already there
    // from the read that filled the page, and both entries age out together.
    it('does not warm the memo when the page is served from cache', async () => {
      cache.cached.mockResolvedValueOnce({
        total: 1,
        page: 1,
        pageSize: 20,
        items: [item('A1')],
      });

      await service.listArticleMetadata(10001, 100002, 1, 20);

      expect(tecdoc.getArticles).not.toHaveBeenCalled();
      expect(linkedVehicles.rememberLinkageRoles).not.toHaveBeenCalled();
    });
  });

  describe('getArticleDetail', () => {
    it('caches with the brand key and joins the logo', async () => {
      tecdoc.getArticleDetails.mockResolvedValueOnce({
        ...item('A1'),
        images: [],
      });

      await service.getArticleDetail(BOSCH, 'A1', 10001);

      expect(cache.cached).toHaveBeenCalledWith(
        'tecdoc:article-detail:30:A1',
        24 * 60 * 60,
        expect.any(Function),
      );
      expect(brands.attachLogos).toHaveBeenCalled();
    });

    // Nothing in the payload varies by vehicle while fitsVehicle is unresolved,
    // so keying on it stored one identical copy per vehicle a visitor arrived
    // from.
    it('serves one entry regardless of the vehicle the visitor arrived from', async () => {
      tecdoc.getArticleDetails.mockResolvedValue({
        ...item('A1'),
        images: [],
      });

      await service.getArticleDetail(BOSCH, 'A1', 10001);
      await service.getArticleDetail(BOSCH, 'A1', 20002);
      await service.getArticleDetail(BOSCH, 'A1');

      const keys = cache.cached.mock.calls.map(([key]) => key);
      expect(new Set(keys)).toEqual(new Set(['tecdoc:article-detail:30:A1']));
    });

    // Two suppliers filing one number are two parts, and a key that omits the
    // brand serves the first one cached to everyone asking for the second.
    it('keys two brands sharing a number separately', async () => {
      tecdoc.getArticleDetails.mockResolvedValue({
        ...item('OX 982D'),
        images: [],
      });

      await service.getArticleDetail(BOSCH, 'OX 982D');
      await service.getArticleDetail(94, 'OX 982D');

      expect(cache.cached).toHaveBeenNthCalledWith(
        1,
        'tecdoc:article-detail:30:OX 982D',
        expect.any(Number),
        expect.any(Function),
      );
      expect(cache.cached).toHaveBeenNthCalledWith(
        2,
        'tecdoc:article-detail:94:OX 982D',
        expect.any(Number),
        expect.any(Function),
      );
    });

    it('surfaces a TecDoc miss as a 404', async () => {
      tecdoc.getArticleDetails.mockRejectedValueOnce(
        new ArticleNotFoundException(),
      );

      await expect(
        service.getArticleDetail(BOSCH, 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('keeps a failed catalogue read out of the 404 path', async () => {
      tecdoc.getArticleDetails.mockRejectedValueOnce(
        new CatalogUnavailableException(),
      );

      // A TecDoc outage used to be reported as "article not found", telling the
      // customer a part we do sell does not exist — and inviting the client to
      // treat a transient failure as permanent.
      await expect(
        service.getArticleDetail(BOSCH, 'A1'),
      ).rejects.toBeInstanceOf(CatalogUnavailableException);
    });
  });

  describe('getSubstitutes', () => {
    it('caches (24h hit / 1h miss), joins logos and caps at the limit', async () => {
      const many = Array.from({ length: 25 }, (_, i) => item(`S${i}`));
      tecdoc.getComparableArticles.mockResolvedValueOnce(many);

      const result = await service.getSubstitutes('SRC');

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:substitutes:SRC',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
      expect(result).toHaveLength(20);
    });

    // A comparable-number search matches the searched number itself, and a part
    // is not its own substitute — whichever brand filed it.
    it('drops the searched part from its own comparable list', async () => {
      tecdoc.getComparableArticles.mockResolvedValueOnce([
        item('SRC'),
        item('SRC', { brandId: '72', brandName: 'MANN-FILTER' }),
        item('A1'),
      ]);

      const result = await service.getSubstitutes('SRC');

      expect(result.map((part) => part.articleNumber)).toEqual(['A1']);
    });
  });

  describe('getAlternativeNumbers', () => {
    it('projects the comparable parts down to number and brand', async () => {
      tecdoc.getComparableArticles.mockResolvedValueOnce([
        item('OF-OC115', { brandName: 'MANN-FILTER' }),
        item('OF-WL7090', { brandName: 'WIX Filters' }),
      ]);

      expect(await service.getAlternativeNumbers('OX 982D')).toEqual([
        { articleNumber: 'OF-OC115', brandName: 'MANN-FILTER' },
        { articleNumber: 'OF-WL7090', brandName: 'WIX Filters' },
      ]);
    });

    // Both surfaces read the same TecDoc comparable-number set, so opening one
    // warms the other instead of paying for a second lookup.
    it('shares the substitutes cache entry', async () => {
      tecdoc.getComparableArticles.mockResolvedValueOnce([]);

      await service.getAlternativeNumbers('SRC');

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:substitutes:SRC',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
    });

    it('caps at the substitutes limit', async () => {
      tecdoc.getComparableArticles.mockResolvedValueOnce(
        Array.from({ length: 25 }, (_, index) => item(`S${index}`)),
      );

      expect(await service.getAlternativeNumbers('SRC')).toHaveLength(20);
    });

    // The chips render the brand as text, so the logo join would be a round trip
    // spent on a field nothing in the response carries.
    it('skips the brand-logo join', async () => {
      tecdoc.getComparableArticles.mockResolvedValueOnce([item('OF-OC115')]);

      await service.getAlternativeNumbers('SRC');

      expect(brands.attachLogos).not.toHaveBeenCalled();
    });
  });

  describe('getArticlesAvailability', () => {
    it('turns the inventory map into a keyed availability object', async () => {
      const detail = {
        available: true,
      } as unknown as ArticleInventoryDetailDto;
      inventory.getAvailability.mockResolvedValueOnce(
        new Map([['OF-OC115', detail]]),
      );

      const result = await service.getArticlesAvailability(['OF-OC115']);

      expect(result).toEqual({ 'OF-OC115': detail });
    });

    it('propagates an inventory read failure', async () => {
      inventory.getAvailability.mockRejectedValueOnce(new Error('db down'));

      await expect(service.getArticlesAvailability(['X'])).rejects.toThrow(
        'db down',
      );
    });
  });
});
