import { NotFoundException } from '@nestjs/common';
import {
  ArticleSummaryDto,
  ArticleInventoryDetailDto,
  articleIdentityKey,
} from '@vp-parts-shop/shared';
import { InventoryService } from '../../inventory';
import { CatalogUnavailableException } from '../../tecdoc';
import { BrandsService } from '../brands';
import { ArticleNotFoundException } from './article-not-found.exception';
import { ArticleReadCache } from './article-read';
import { ArticlesService } from './articles.service';

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

describe('ArticlesService', () => {
  let brands: { attachLogos: jest.Mock };
  let inventory: { getAvailability: jest.Mock };
  let articleRead: { read: jest.Mock };
  let service: ArticlesService;

  beforeEach(() => {
    // attachLogos is an identity passthrough here; the join itself is covered
    // in the BrandsService spec.
    brands = {
      attachLogos: jest.fn((items: unknown) => Promise.resolve(items)),
    };
    inventory = { getAvailability: jest.fn().mockResolvedValue(new Map()) };
    articleRead = { read: jest.fn() };

    service = new ArticlesService(
      brands as unknown as BrandsService,
      inventory as unknown as InventoryService,
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
