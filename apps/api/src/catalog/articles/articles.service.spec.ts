import { NotFoundException } from '@nestjs/common';
import {
  ArticleSummaryDto,
  ArticleInventoryDetailDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { InventoryService } from '../../inventory';
import { BrandsService } from '../brands';
import { ArticlesTecDoc } from './articles.tecdoc';
import { ArticlesService } from './articles.service';

function item(
  articleNumber: string,
  overrides: Partial<ArticleSummaryDto> = {},
): ArticleSummaryDto {
  return {
    articleNumber,
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

describe('ArticlesService', () => {
  let tecdoc: {
    getArticles: jest.Mock;
    getArticleDetails: jest.Mock;
    getSubstitutes: jest.Mock;
  };
  let cache: { cached: jest.Mock; cachedArray: jest.Mock };
  let brands: { attachLogos: jest.Mock };
  let inventory: { getAvailability: jest.Mock };
  let service: ArticlesService;

  beforeEach(() => {
    tecdoc = {
      getArticles: jest.fn(),
      getArticleDetails: jest.fn(),
      getSubstitutes: jest.fn(),
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

    service = new ArticlesService(
      tecdoc as unknown as ArticlesTecDoc,
      cache as unknown as RedisCache,
      brands as unknown as BrandsService,
      inventory as unknown as InventoryService,
    );
  });

  describe('listArticleMetadata', () => {
    it('caches by vehicle/category/page/size for 24h and joins brand logos', async () => {
      tecdoc.getArticles.mockResolvedValueOnce({
        total: 1,
        page: 1,
        pageSize: 20,
        items: [item('A1')],
      });

      const result = await service.listArticleMetadata(
        '10001',
        '100002',
        1,
        20,
      );

      expect(cache.cached).toHaveBeenCalledWith(
        'tecdoc:articles:10001:100002:1:20',
        24 * 60 * 60,
        expect.any(Function),
      );
      expect(brands.attachLogos).toHaveBeenCalledWith([item('A1')]);
      expect(result.items).toEqual([item('A1')]);
    });
  });

  describe('getArticleDetail', () => {
    it('caches with the vehicle key and joins the logo', async () => {
      tecdoc.getArticleDetails.mockResolvedValueOnce({
        ...item('A1'),
        images: [],
        compatibleVehicles: [],
      });

      await service.getArticleDetail('A1', 'V1');

      expect(cache.cached).toHaveBeenCalledWith(
        'tecdoc:article-detail:A1:V1',
        24 * 60 * 60,
        expect.any(Function),
      );
      expect(brands.attachLogos).toHaveBeenCalled();
    });

    it('uses the "none" vehicle key when no vehicle is given', async () => {
      tecdoc.getArticleDetails.mockResolvedValueOnce({
        ...item('A1'),
        images: [],
        compatibleVehicles: [],
      });

      await service.getArticleDetail('A1');

      expect(cache.cached).toHaveBeenCalledWith(
        'tecdoc:article-detail:A1:none',
        24 * 60 * 60,
        expect.any(Function),
      );
    });

    it('maps a TecDoc miss to a NotFoundException', async () => {
      tecdoc.getArticleDetails.mockRejectedValueOnce(new Error('not found'));

      await expect(service.getArticleDetail('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getSubstitutes', () => {
    it('caches (24h hit / 1h miss), joins logos and caps at the limit', async () => {
      const many = Array.from({ length: 25 }, (_, i) => item(`S${i}`));
      tecdoc.getSubstitutes.mockResolvedValueOnce(many);

      const result = await service.getSubstitutes('SRC');

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:substitutes:SRC',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
      expect(result).toHaveLength(20);
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
