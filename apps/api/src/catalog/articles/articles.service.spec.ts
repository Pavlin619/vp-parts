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
import { ArticlesService, LINKED_VEHICLES_LIMIT } from './articles.service';

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

describe('ArticlesService', () => {
  let tecdoc: {
    getArticles: jest.Mock;
    getArticleDetails: jest.Mock;
    getSubstitutes: jest.Mock;
    getLegacyArticleIds: jest.Mock;
    getLinkedTargetIds: jest.Mock;
    getLinkageTargets: jest.Mock;
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
      getLegacyArticleIds: jest.fn().mockResolvedValue([]),
      getLinkedTargetIds: jest.fn().mockResolvedValue([]),
      getLinkageTargets: jest.fn().mockResolvedValue([]),
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

      const result = await service.listArticleMetadata(10001, 100002, 1, 20);

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
    it('caches with the brand and vehicle key and joins the logo', async () => {
      tecdoc.getArticleDetails.mockResolvedValueOnce({
        ...item('A1'),
        images: [],
        compatibleVehicles: [],
      });

      await service.getArticleDetail(BOSCH, 'A1', 10001);

      expect(cache.cached).toHaveBeenCalledWith(
        'tecdoc:article-detail:30:A1:10001',
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

      await service.getArticleDetail(BOSCH, 'A1');

      expect(cache.cached).toHaveBeenCalledWith(
        'tecdoc:article-detail:30:A1:none',
        24 * 60 * 60,
        expect.any(Function),
      );
    });

    // Two suppliers filing one number are two parts, and a key that omits the
    // brand serves the first one cached to everyone asking for the second.
    it('keys two brands sharing a number separately', async () => {
      tecdoc.getArticleDetails.mockResolvedValue({
        ...item('OX 982D'),
        images: [],
        compatibleVehicles: [],
      });

      await service.getArticleDetail(BOSCH, 'OX 982D');
      await service.getArticleDetail(94, 'OX 982D');

      expect(cache.cached).toHaveBeenNthCalledWith(
        1,
        'tecdoc:article-detail:30:OX 982D:none',
        expect.any(Number),
        expect.any(Function),
      );
      expect(cache.cached).toHaveBeenNthCalledWith(
        2,
        'tecdoc:article-detail:94:OX 982D:none',
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

  describe('getAlternativeNumbers', () => {
    it('projects the comparable parts down to number and brand', async () => {
      tecdoc.getSubstitutes.mockResolvedValueOnce([
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
      tecdoc.getSubstitutes.mockResolvedValueOnce([]);

      await service.getAlternativeNumbers('SRC');

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:substitutes:SRC',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
    });

    it('caps at the substitutes limit', async () => {
      tecdoc.getSubstitutes.mockResolvedValueOnce(
        Array.from({ length: 25 }, (_, index) => item(`S${index}`)),
      );

      expect(await service.getAlternativeNumbers('SRC')).toHaveLength(20);
    });

    // The chips render the brand as text, so the logo join would be a round trip
    // spent on a field nothing in the response carries.
    it('skips the brand-logo join', async () => {
      tecdoc.getSubstitutes.mockResolvedValueOnce([item('OF-OC115')]);

      await service.getAlternativeNumbers('SRC');

      expect(brands.attachLogos).not.toHaveBeenCalled();
    });
  });

  describe('getLinkedVehicles', () => {
    it('caches by brand and article number (24h hit / 1h miss)', async () => {
      await service.getLinkedVehicles(BOSCH, 'OF-OC115');

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:linked-vehicles:30:OF-OC115',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
    });

    // TecDoc splits the answer three ways — the number resolves to a legacy id,
    // the id answers with bare target ids, and only the target read knows what
    // those ids are called — so joining them is this service's job.
    // Unlike the summary surfaces there is no brand-logo join: these are
    // vehicles, not articles, so the TecDoc rows pass through untouched.
    it('joins the three TecDoc reads into vehicle rows', async () => {
      const vehicles = [{ vehicleId: '10020', manufacturerName: 'BMW' }];
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([10020]);
      tecdoc.getLinkageTargets.mockResolvedValueOnce(vehicles);

      const result = await service.getLinkedVehicles(BOSCH, 'OF-OC115');

      expect(tecdoc.getLegacyArticleIds).toHaveBeenCalledWith(
        BOSCH,
        'OF-OC115',
      );
      expect(tecdoc.getLinkedTargetIds).toHaveBeenCalledWith(555);
      expect(tecdoc.getLinkageTargets).toHaveBeenCalledWith([10020]);
      expect(result).toEqual(vehicles);
      expect(brands.attachLogos).not.toHaveBeenCalled();
    });

    // The mapping only moves when TecDoc ships a data release, so it is
    // memoised separately from the vehicles assembled out of it.
    it('memoises the article-number lookup by brand and number', async () => {
      await service.getLinkedVehicles(BOSCH, 'OF-OC115');

      expect(cache.cached).toHaveBeenCalledWith(
        'tecdoc:article-legacy-ids:30:OF-OC115',
        24 * 60 * 60,
        expect.any(Function),
      );
    });

    // The saving the memo exists for: a part looked up again inside the TTL
    // costs the two reads that actually carry linkage data, not three.
    it('skips the article read when the ids are already memoised', async () => {
      cache.cached.mockResolvedValueOnce([7]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([10020]);

      await service.getLinkedVehicles(BOSCH, 'OF-OC115');

      expect(tecdoc.getLegacyArticleIds).not.toHaveBeenCalled();
      expect(tecdoc.getLinkedTargetIds).toHaveBeenCalledWith(7);
    });

    // Linkages are filed per generic-article role, so a part sold in two roles
    // needs both read — and the sets overlap wherever a vehicle takes the part
    // in either one.
    it('merges and dedupes the linkages of every role', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([1, 2]);
      tecdoc.getLinkedTargetIds
        .mockResolvedValueOnce([10020, 10021])
        .mockResolvedValueOnce([10021, 10022]);

      await service.getLinkedVehicles(BOSCH, 'OF-OC115');

      expect(tecdoc.getLinkedTargetIds).toHaveBeenNthCalledWith(1, 1);
      expect(tecdoc.getLinkedTargetIds).toHaveBeenNthCalledWith(2, 2);
      expect(tecdoc.getLinkageTargets).toHaveBeenCalledWith([
        10020, 10021, 10022,
      ]);
    });

    // TecDoc's linkage read takes no page parameters and always answers in
    // full, so the cap has to be applied to the ids before hydrating them.
    it('caps the ids it hydrates', async () => {
      const targetIds = Array.from(
        { length: LINKED_VEHICLES_LIMIT + 5 },
        (_, index) => index + 1,
      );
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([1]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce(targetIds);

      await service.getLinkedVehicles(BOSCH, 'OF-OC115');

      expect(tecdoc.getLinkageTargets).toHaveBeenCalledWith(
        targetIds.slice(0, LINKED_VEHICLES_LIMIT),
      );
    });

    it('hydrates nothing when the article has no linked vehicles', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([1]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([]);

      expect(await service.getLinkedVehicles(BOSCH, 'OF-OC115')).toEqual([]);
      expect(tecdoc.getLinkageTargets).not.toHaveBeenCalled();
    });

    // A part whose only role is axle- or universal-linked resolves to no ids
    // at all, and there is nothing to ask the linkage read about.
    it('reads nothing further when the part has no vehicle-linked role', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([]);

      expect(await service.getLinkedVehicles(BOSCH, 'OF-OC115')).toEqual([]);
      expect(tecdoc.getLinkedTargetIds).not.toHaveBeenCalled();
      expect(tecdoc.getLinkageTargets).not.toHaveBeenCalled();
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
