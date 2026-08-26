import { NotFoundException } from '@nestjs/common';
import {
  ArticleSummaryDto,
  ArticleInventoryDetailDto,
  articleIdentityKey,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { InventoryService } from '../../inventory';
import { CatalogUnavailableException } from '../../tecdoc';
import { BrandsService } from '../brands';
import { ArticleNotFoundException } from './article-not-found.exception';
import { ArticleReadCache } from './article-read';
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
  let tecdoc: { getArticles: jest.Mock };
  let cache: { cached: jest.Mock };
  let brands: { attachLogos: jest.Mock };
  let inventory: { getAvailability: jest.Mock };
  let linkedVehicles: { rememberLinkageRoles: jest.Mock };
  let articleRead: { read: jest.Mock };
  let service: ArticlesService;

  beforeEach(() => {
    tecdoc = { getArticles: jest.fn() };
    cache = {
      cached: jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
        loader(),
      ),
    };
    // attachLogos is an identity passthrough here; the join itself is covered
    // in the BrandsService spec.
    brands = {
      attachLogos: jest.fn((items: unknown) => Promise.resolve(items)),
    };
    inventory = { getAvailability: jest.fn().mockResolvedValue(new Map()) };
    linkedVehicles = {
      rememberLinkageRoles: jest.fn().mockResolvedValue(undefined),
    };
    articleRead = { read: jest.fn() };

    service = new ArticlesService(
      tecdoc as unknown as ArticlesTecDoc,
      cache as unknown as RedisCache,
      brands as unknown as BrandsService,
      inventory as unknown as InventoryService,
      linkedVehicles as unknown as LinkedVehiclesService,
      articleRead as unknown as ArticleReadCache,
    );
  });

  /** The cached article read the detail page is assembled from. */
  function givenArticle(articleNumber: string): void {
    articleRead.read.mockResolvedValue({
      detail: { ...item(articleNumber), images: [] },
      genericArticleIds: [82],
    });
  }

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
    // The read itself, and how it is keyed, belong to ArticleReadCache; what this
    // service adds on top is the brand-logo join.
    it('joins the brand logo onto the cached read', async () => {
      givenArticle('A1');

      const detail = await service.getArticleDetail(BOSCH, 'A1', 10001);

      expect(articleRead.read).toHaveBeenCalledWith(BOSCH, 'A1', 10001);
      expect(brands.attachLogos).toHaveBeenCalled();
      expect(detail.articleNumber).toBe('A1');
    });

    it('surfaces a TecDoc miss as a 404', async () => {
      articleRead.read.mockRejectedValueOnce(new ArticleNotFoundException());

      await expect(
        service.getArticleDetail(BOSCH, 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('keeps a failed catalogue read out of the 404 path', async () => {
      articleRead.read.mockRejectedValueOnce(new CatalogUnavailableException());

      // A TecDoc outage used to be reported as "article not found", telling the
      // customer a part we do sell does not exist — and inviting the client to
      // treat a transient failure as permanent.
      await expect(
        service.getArticleDetail(BOSCH, 'A1'),
      ).rejects.toBeInstanceOf(CatalogUnavailableException);
    });
  });

  describe('getArticlesAvailability', () => {
    const OC115 = { brandId: String(BOSCH), articleNumber: 'OF-OC115' };

    it('turns the inventory map into a keyed availability object', async () => {
      const detail = {
        available: true,
      } as unknown as ArticleInventoryDetailDto;
      const key = articleIdentityKey(BOSCH, 'OF-OC115');
      inventory.getAvailability.mockResolvedValueOnce(new Map([[key, detail]]));

      const result = await service.getArticlesAvailability([OC115]);

      expect(inventory.getAvailability).toHaveBeenCalledWith([OC115]);
      expect(result).toEqual({ [key]: detail });
    });

    it('propagates an inventory read failure', async () => {
      inventory.getAvailability.mockRejectedValueOnce(new Error('db down'));

      await expect(service.getArticlesAvailability([OC115])).rejects.toThrow(
        'db down',
      );
    });
  });
});
