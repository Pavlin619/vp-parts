import { Logger } from '@nestjs/common';
import {
  ArticleSummaryDto,
  ArticleInventoryDetailDto,
  articleIdentityKey,
} from '@vp-parts-shop/shared';
import { RedisCache, CachedManyRequest } from '../../../redis';
import {
  InventoryService,
  InventoryUnavailableException,
} from '../../../inventory';
import { ArticleStatus, CrossReferenceCandidate } from '../../../tecdoc';
import { BrandsService } from '../../brands';
import { ArticleReadCache } from '../article-read';
import { CrossReferencesService } from './cross-references.service';
import { CrossReferencesTecDoc } from './cross-references.tecdoc';

const BOSCH = 30;
const FERODO = '101';
const BRAKE_DISC = 82;

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

/** A cross-reference candidate that cites the viewed part, as TecDoc's do. */
function candidate(
  articleNumber: string,
  overrides: Partial<CrossReferenceCandidate> = {},
): CrossReferenceCandidate {
  return {
    brandId: FERODO,
    brandName: 'Ferodo',
    articleNumber,
    description: 'Спирачен диск',
    legacyArticleIds: [700 + articleNumber.length],
    articleStatusId: ArticleStatus.Normal,
    citedNumbers: [{ brandId: String(BOSCH), articleNumber: 'SRC' }],
    ...overrides,
  };
}

const OUT_OF_STOCK: ArticleInventoryDetailDto = {
  available: false,
  bestPriceExVat: null,
  bestPriceIncVat: null,
  availabilityByWarehouse: [],
  computedAt: null,
};

describe('CrossReferencesService', () => {
  let tecdoc: {
    getCrossReferenceCandidates: jest.Mock;
    getArticleRowsByLegacyIds: jest.Mock;
  };
  let cache: { cachedArray: jest.Mock; cachedMany: jest.Mock };
  let brands: { attachLogos: jest.Mock };
  let inventory: { getAvailability: jest.Mock };
  let articleRead: { read: jest.Mock };
  let service: CrossReferencesService;

  beforeEach(() => {
    tecdoc = {
      getCrossReferenceCandidates: jest.fn().mockResolvedValue([]),
      getArticleRowsByLegacyIds: jest.fn().mockResolvedValue([]),
    };
    cache = {
      cachedArray: jest.fn(
        (_key: string, _hit: number, _miss: number, loader: () => unknown) =>
          loader(),
      ),
      // Every row a miss, so the tests see what the hydration read is asked for.
      cachedMany: jest.fn((request: CachedManyRequest<unknown, unknown>) =>
        request.loadMissing(request.items),
      ),
    };
    // attachLogos is an identity passthrough here; the join itself is covered
    // in the BrandsService spec.
    brands = {
      attachLogos: jest.fn((items: unknown) => Promise.resolve(items)),
    };
    inventory = { getAvailability: jest.fn().mockResolvedValue(new Map()) };
    articleRead = { read: jest.fn() };

    service = new CrossReferencesService(
      tecdoc as unknown as CrossReferencesTecDoc,
      cache as unknown as RedisCache,
      brands as unknown as BrandsService,
      inventory as unknown as InventoryService,
      articleRead as unknown as ArticleReadCache,
    );
  });

  /**
   * Points the article read at a part of the given type filing the given OE
   * numbers. Every cross-reference search starts from that read — the type the
   * search is narrowed to comes from it.
   */
  function givenArticle(
    articleNumber: string,
    options: { genericArticleIds?: number[]; oeNumbers?: string[] } = {},
  ): void {
    const { genericArticleIds = [BRAKE_DISC], oeNumbers = [] } = options;

    articleRead.read.mockResolvedValue({
      detail: {
        ...item(articleNumber, {
          oemNumbers: oeNumbers.map((oeNumber) => ({
            articleNumber: oeNumber,
            manufacturerName: 'VW',
            interchangeability: null,
          })),
        }),
        images: [],
      },
      genericArticleIds,
    });
  }

  /** Hydration answers with a row per id, so the page can be asserted on. */
  function givenHydratedRows(): void {
    tecdoc.getArticleRowsByLegacyIds.mockImplementation(
      (legacyArticleIds: number[]) =>
        Promise.resolve(
          legacyArticleIds.map((id) =>
            item(`ROW-${id}`, { brandId: '101', brandName: 'Ferodo' }),
          ),
        ),
    );
  }

  function crossReferenceCacheKeys() {
    return cache.cachedArray.mock.calls
      .map(([key]) => key)
      .filter((key: string) => key.startsWith('tecdoc:crossrefs:'));
  }

  describe('getSubstitutes', () => {
    it('searches the cross-reference index for the part’s own type', async () => {
      givenArticle('SRC');
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1'),
        candidate('A2'),
        candidate('A3'),
        candidate('A4'),
        candidate('A5'),
      ]);

      await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      expect(tecdoc.getCrossReferenceCandidates).toHaveBeenCalledWith(
        'SRC',
        BRAKE_DISC,
      );
    });

    it('caches the candidate set (24h hit / 1h miss) and joins logos onto the page', async () => {
      givenArticle('SRC');
      givenHydratedRows();
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1'),
      ]);

      const page = await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:crossrefs:30:SRC',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
      expect(brands.attachLogos).toHaveBeenCalledWith(page.items);
    });

    // Absent paging is the first page at the default size, so a bare request from
    // the section lands somewhere real without the controller filling it in.
    it('defaults to the first page of twenty', async () => {
      givenArticle('SRC');

      const page = await service.getSubstitutes(BOSCH, 'SRC');

      expect(page).toMatchObject({ page: 1, pageSize: 20 });
    });

    /**
     * The section shows every alternative, so the whole set is counted and only
     * the requested page is hydrated — a candidate costs under a kilobyte where a
     * rendered row costs ten to thirty.
     */
    it('reports the whole set but hydrates only the requested page', async () => {
      givenArticle('SRC');
      givenHydratedRows();
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce(
        // Padded so the tiebreak on article number is also the numeric order,
        // and the page a request lands on can be named.
        Array.from({ length: 45 }, (_, index) =>
          candidate(`A${String(index).padStart(2, '0')}`, {
            legacyArticleIds: [index],
          }),
        ),
      );

      const page = await service.getSubstitutes(BOSCH, 'SRC', 2, 20);

      expect(page.total).toBe(45);
      expect(page.page).toBe(2);
      expect(page.items).toHaveLength(20);
      expect(tecdoc.getArticleRowsByLegacyIds).toHaveBeenCalledWith(
        Array.from({ length: 20 }, (_, index) => index + 20),
      );
    });

    it('caches each hydrated row under its own key for 24h', async () => {
      givenArticle('SRC');
      givenHydratedRows();
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1', { legacyArticleIds: [777] }),
      ]);

      await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      const [request] = cache.cachedMany.mock.calls[0] as [
        CachedManyRequest<CrossReferenceCandidate, ArticleSummaryDto>,
      ];
      expect(request.ttl).toBe(24 * 60 * 60);
      expect(request.keyOf(candidate('A1'))).toBe('tecdoc:article-row:101:A1');
    });

    /**
     * The rows a visitor sees first are the ones we can actually ship, which is
     * the reason the whole set is resolved before any of it is paged.
     */
    it('orders the whole set by availability before paging it', async () => {
      givenArticle('SRC');
      givenHydratedRows();
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('OUT-OF-STOCK', { legacyArticleIds: [1] }),
        candidate('IN-STOCK', { legacyArticleIds: [2] }),
      ]);
      inventory.getAvailability.mockResolvedValueOnce(
        new Map([
          [articleIdentityKey(FERODO, 'OUT-OF-STOCK'), OUT_OF_STOCK],
          [
            articleIdentityKey(FERODO, 'IN-STOCK'),
            { ...OUT_OF_STOCK, available: true, bestPriceIncVat: 4200 },
          ],
        ]),
      );

      const page = await service.getSubstitutes(BOSCH, 'SRC', 1, 1);

      // Priced as the brand that files each number, never by the number alone.
      expect(inventory.getAvailability).toHaveBeenCalledWith([
        { brandId: FERODO, articleNumber: 'OUT-OF-STOCK' },
        { brandId: FERODO, articleNumber: 'IN-STOCK' },
      ]);
      expect(tecdoc.getArticleRowsByLegacyIds).toHaveBeenCalledWith([2]);
      expect(page.items).toHaveLength(1);
    });

    /**
     * Availability fails closed everywhere else. Here it must not: a stock-DB
     * outage costs the list its ordering, not its existence — the rows' own prices
     * are a separate, still-fail-closed read.
     */
    it('degrades to catalogue order when availability cannot be read', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      givenArticle('SRC');
      givenHydratedRows();
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1', { legacyArticleIds: [1] }),
      ]);
      inventory.getAvailability.mockRejectedValueOnce(
        new InventoryUnavailableException(),
      );

      const page = await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      expect(page.total).toBe(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('availability unavailable'),
      );

      warn.mockRestore();
    });

    // The search answers with the part it was given among the rest, and a part is
    // not its own substitute.
    it('drops the viewed part from its own cross-references', async () => {
      givenArticle('SRC');
      givenHydratedRows();
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('SRC', { brandId: String(BOSCH), brandName: 'Bosch' }),
        candidate('A1'),
      ]);

      const page = await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      expect(page.total).toBe(1);
    });

    /**
     * The collision the provenance check exists for: a row that matched our
     * digits because *another* brand files them is not replacing our part.
     */
    it('drops a candidate that cites another brand’s number', async () => {
      givenArticle('SRC');
      givenHydratedRows();
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1'),
        candidate('A2', {
          citedNumbers: [{ brandId: '4', articleNumber: 'SRC' }],
        }),
      ]);

      const page = await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      expect(page.total).toBe(1);
    });

    // The search narrows to the part's type, so a part TecDoc catalogues as
    // nothing has no search to run — an unnarrowed one returns other kinds of part.
    it('returns nothing, and searches nothing, for a part with no generic article', async () => {
      givenArticle('SRC', { genericArticleIds: [] });

      const page = await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      expect(page).toEqual({ total: 0, page: 1, pageSize: 20, items: [] });
      expect(tecdoc.getCrossReferenceCandidates).not.toHaveBeenCalled();
    });

    // Which part a number means depends on who filed it, so two suppliers sharing
    // a number have different replacements. A number-only key served one brand's
    // list to the other.
    it('keys two brands sharing a number separately', async () => {
      givenArticle('OX 982D');

      await service.getSubstitutes(BOSCH, 'OX 982D', 1, 20);
      await service.getSubstitutes(94, 'OX 982D', 1, 20);

      expect(crossReferenceCacheKeys()).toEqual([
        'tecdoc:crossrefs:30:OX 982D',
        'tecdoc:crossrefs:94:OX 982D',
      ]);
    });
  });

  /**
   * How many suppliers cite a brand is a property of TecDoc's data. A short list
   * is served short and an empty one stays empty: the one search is the whole
   * answer, and a second source would be a different question — which parts fit
   * the same original — answered as if it were this one.
   */
  describe('a cross-reference set the index answers thinly', () => {
    it('serves a single candidate as the whole list', async () => {
      givenArticle('SRC', { oeNumbers: ['1K0 615 301 AA'] });
      givenHydratedRows();
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1'),
      ]);

      const page = await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      expect(page.total).toBe(1);
      expect(tecdoc.getCrossReferenceCandidates).toHaveBeenCalledTimes(1);
    });

    it('reads nothing beyond the one search, whatever OE numbers the part files', async () => {
      givenArticle('SRC', { oeNumbers: ['OE-1', 'OE-2', 'OE-3'] });

      const page = await service.getSubstitutes(BOSCH, 'SRC', 1, 20);

      expect(page.total).toBe(0);
      expect(tecdoc.getCrossReferenceCandidates).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAlternativeNumbers', () => {
    it('projects the candidate set down to number and brand', async () => {
      givenArticle('SRC');
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('OF-OC115', { brandName: 'MANN-FILTER' }),
        candidate('OF-WL7090', { brandName: 'WIX Filters' }),
        candidate('A3'),
        candidate('A4'),
        candidate('A5'),
      ]);

      const numbers = await service.getAlternativeNumbers(BOSCH, 'SRC');

      expect(numbers).toEqual([
        { articleNumber: 'OF-OC115', brandName: 'MANN-FILTER' },
        { articleNumber: 'OF-WL7090', brandName: 'WIX Filters' },
        { articleNumber: 'A3', brandName: 'Ferodo' },
        { articleNumber: 'A4', brandName: 'Ferodo' },
        { articleNumber: 'A5', brandName: 'Ferodo' },
      ]);
    });

    // Both surfaces read the same set, so opening one warms the other instead of
    // paying for a second search.
    it('shares the substitutes cache entry', async () => {
      givenArticle('SRC');

      await service.getAlternativeNumbers(BOSCH, 'SRC');

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:crossrefs:30:SRC',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
    });

    /**
     * A chip is a number and a brand, and the candidate carries both — so this
     * surface costs no hydration at all, however many alternatives there are.
     */
    it('hydrates nothing and prices nothing', async () => {
      givenArticle('SRC');
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('A1'),
        candidate('A2'),
        candidate('A3'),
        candidate('A4'),
        candidate('A5'),
      ]);

      await service.getAlternativeNumbers(BOSCH, 'SRC');

      expect(tecdoc.getArticleRowsByLegacyIds).not.toHaveBeenCalled();
      expect(inventory.getAvailability).not.toHaveBeenCalled();
    });

    // The chips render the brand as text, so joining logos onto them would be a
    // round trip spent on a field nothing in the response carries.
    it('joins no brand logo', async () => {
      givenArticle('SRC');
      tecdoc.getCrossReferenceCandidates.mockResolvedValueOnce([
        candidate('OF-OC115'),
      ]);

      await service.getAlternativeNumbers(BOSCH, 'SRC');

      expect(brands.attachLogos).not.toHaveBeenCalled();
    });
  });
});
