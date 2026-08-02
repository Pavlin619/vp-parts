import { Logger } from '@nestjs/common';
import { TecDocTransport } from '../../tecdoc';
import { ArticleNotFoundException } from './article-not-found.exception';
import { ArticlesTecDoc, SUBSTITUTES_LIMIT } from './articles.tecdoc';

const BOSCH = 30;

function record(
  articleNumber: string,
  overrides: { dataSupplierId?: number; mfrName?: string } = {},
) {
  const { dataSupplierId = BOSCH, mfrName = 'Bosch' } = overrides;

  return {
    articleNumber,
    dataSupplierId,
    mfrName,
    genericArticles: [
      { genericArticleDescription: 'Part', legacyArticleId: 555 },
    ],
    images: [{ imageURL800: `https://img/${articleNumber}.jpg` }],
  };
}

/**
 * A `getArticleLinkedAllLinkingTarget4` response. The real one nests the
 * linkages two levels deep and carries ids only — no vehicle detail whatsoever.
 */
function linkageResponse(...targets: Array<{ id: number; linked?: boolean }>) {
  return {
    status: 200,
    data: {
      array: [
        {
          articleLinkages: {
            array: targets.map(({ id, linked = true }) => ({
              articleLinkId: id * 10,
              linked,
              linkingTargetId: id,
              linkingTargetType: 'P',
            })),
          },
        },
      ],
    },
  };
}

describe('ArticlesTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: ArticlesTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new ArticlesTecDoc({ call } as unknown as TecDocTransport);
  });

  describe('getArticles', () => {
    it('scopes to vehicle + category and maps a paginated page', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 2,
        articles: [record('A1'), record('A2')],
      });

      const result = await tecdoc.getArticles(10001, 100002, 1, 20);

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({
          assemblyGroupNodeIds: 100002,
          linkageTargetId: 10001,
          perPage: 20,
          page: 1,
          includeAll: true,
        }),
      );
      expect(result.total).toBe(2);
      expect(result.items.map((i) => i.articleNumber)).toEqual(['A1', 'A2']);
    });

    // A category with no parts for this vehicle is an ordinary status-200
    // response with the `articles` key omitted, not an error and not `[]`.
    it('returns an empty page when TecDoc omits the articles collection', async () => {
      call.mockResolvedValueOnce({ totalMatchingArticles: 0, status: 200 });

      const result = await tecdoc.getArticles(10001, 100002, 1, 20);

      expect(result).toEqual({ total: 0, page: 1, pageSize: 20, items: [] });
    });
  });

  describe('getArticleDetails', () => {
    it('maps the article with its image gallery', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      const result = await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(result.images).toEqual(['https://img/A1.jpg']);
      expect(result.brandId).toBe('30');
      expect(result.compatibleVehicles).toEqual([]);
    });

    // The bug this exists to prevent: an article number is unique only within a
    // data supplier, so a lookup without one resolves to whichever supplier
    // TecDoc sorted first and shows another company's part.
    it('narrows the search to the brand that filed the number', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({
          searchQuery: 'A1',
          searchType: 0,
          searchMatchType: 'exact',
          dataSupplierIds: [BOSCH],
        }),
      );
    });

    // These records carry the gallery, criteria and OE numbers, so a wider page
    // would be paid for on every read only to throw the surplus away.
    it('asks for a single row', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({ perPage: 1, page: 1 }),
      );
    });

    it('reports an empty result as a typed article miss', async () => {
      call.mockResolvedValueOnce({ articles: [] });

      await expect(
        tecdoc.getArticleDetails(BOSCH, 'missing'),
      ).rejects.toBeInstanceOf(ArticleNotFoundException);
    });

    // The brand filter cannot split two records of one supplier and nothing
    // here can tell which is meant, so the count is read purely to raise the
    // case; the answer stays whichever row TecDoc put first.
    it('warns when the supplier filed the number more than once', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      call.mockResolvedValueOnce({
        totalMatchingArticles: 2,
        articles: [record('A1', { mfrName: 'Bosch Motorsport' })],
      });

      const result = await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(result.brandName).toBe('Bosch Motorsport');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ambiguous'));

      warn.mockRestore();
    });

    it('stays quiet on the single match it expects', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [record('A1')],
      });

      await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    });
  });

  describe('getSubstitutes', () => {
    it('uses comparable search (type 3), caps the page and excludes/dedupes the source', async () => {
      call.mockResolvedValueOnce({
        articles: [record('SRC'), record('A1'), record('A1'), record('A2')],
      });

      const result = await tecdoc.getSubstitutes('SRC');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({
          searchType: 3,
          searchMatchType: 'exact',
          perPage: SUBSTITUTES_LIMIT,
        }),
      );
      expect(result.map((r) => r.articleNumber)).toEqual(['A1', 'A2']);
    });

    // A cross-reference list is precisely the place two suppliers share a
    // number. Deduping on the number alone silently dropped one of them.
    it('keeps two suppliers filing the same number', async () => {
      call.mockResolvedValueOnce({
        articles: [
          record('A1', { dataSupplierId: 30, mfrName: 'Bosch' }),
          record('A1', { dataSupplierId: 72, mfrName: 'MANN-FILTER' }),
        ],
      });

      const result = await tecdoc.getSubstitutes('SRC');

      expect(result.map((r) => r.brandName)).toEqual(['Bosch', 'MANN-FILTER']);
    });

    // Sending `dataSupplierIds` here would filter the results down to the one
    // brand we already have — the opposite of a cross-reference list.
    it('does not narrow the comparable search to a brand', async () => {
      call.mockResolvedValueOnce({ articles: [] });

      await tecdoc.getSubstitutes('SRC');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.not.objectContaining({ dataSupplierIds: expect.anything() }),
      );
    });

    it('returns an empty list when there are no articles', async () => {
      call.mockResolvedValueOnce({});

      expect(await tecdoc.getSubstitutes('SRC')).toEqual([]);
    });
  });

  describe('getLegacyArticleIds', () => {
    it('reads the ids the linkage lookup is keyed by off the article', async () => {
      call.mockResolvedValueOnce({ articles: [record('OF-OC115')] });

      expect(await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115')).toEqual([
        555,
      ]);
      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({
          searchQuery: 'OF-OC115',
          searchType: 0,
          searchMatchType: 'exact',
          dataSupplierIds: [BOSCH],
          includeGenericArticles: true,
        }),
      );
    });

    // TecDoc files one id per article/generic-article pair, so a part sold in
    // two roles carries two of them — with its vehicles split across both.
    it('returns one id per generic article', async () => {
      call.mockResolvedValueOnce({
        articles: [
          {
            ...record('OF-OC115'),
            genericArticles: [
              { genericArticleDescription: 'Oil Filter', legacyArticleId: 1 },
              { genericArticleDescription: 'Filter Set', legacyArticleId: 2 },
            ],
          },
        ],
      });

      expect(await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115')).toEqual([
        1, 2,
      ]);
    });

    // Each id costs a linkage call, and TecDoc already says which families it
    // holds links for — an axle-only role would answer that call with nothing.
    it('skips a generic article with no vehicle linkages', async () => {
      call.mockResolvedValueOnce({
        articles: [
          {
            ...record('OF-OC115'),
            genericArticles: [
              { legacyArticleId: 1, linkageTargetTypes: ['P', 'M'] },
              { legacyArticleId: 2, linkageTargetTypes: ['A'] },
            ],
          },
        ],
      });

      expect(await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115')).toEqual([1]);
    });

    // Absent is TecDoc not saying which families it holds, not saying none, so
    // the id is kept and the linkage call decides.
    it('keeps a generic article that lists no linkage target types', async () => {
      call.mockResolvedValueOnce({
        articles: [
          { ...record('OF-OC115'), genericArticles: [{ legacyArticleId: 1 }] },
        ],
      });

      expect(await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115')).toEqual([1]);
    });

    it('reports an unknown article number as a typed miss', async () => {
      call.mockResolvedValueOnce({ articles: [] });

      await expect(
        tecdoc.getLegacyArticleIds(BOSCH, 'missing'),
      ).rejects.toBeInstanceOf(ArticleNotFoundException);
    });

    // A part TecDoc holds but links to no vehicle is an empty section, not a
    // missing part — the one case that must not become a 404.
    it('returns no ids for a known part with no vehicle-linked role', async () => {
      call.mockResolvedValueOnce({
        articles: [
          {
            ...record('OF-OC115'),
            genericArticles: [
              { legacyArticleId: 1, linkageTargetTypes: ['U'] },
            ],
          },
        ],
      });

      expect(await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115')).toEqual([]);
    });
  });

  describe('getLinkedTargetIds', () => {
    // Note the singular `linking`: this function predates the `linkageTarget*`
    // naming the rest of the catalog uses, and ignores the other spelling.
    it('asks for vehicle linkages by legacy article id', async () => {
      call.mockResolvedValueOnce(linkageResponse({ id: 10020 }));

      expect(await tecdoc.getLinkedTargetIds(555)).toEqual([10020]);
      expect(call).toHaveBeenCalledWith(
        'getArticleLinkedAllLinkingTarget4',
        expect.objectContaining({ articleId: 555, linkingTargetType: 'P' }),
      );
    });

    // TecDoc states a non-fit explicitly rather than omitting the row, so a
    // `linked: false` linkage is an answer — and the answer is "not this one".
    it('drops the targets TecDoc marks as not linked', async () => {
      call.mockResolvedValueOnce(
        linkageResponse({ id: 10020 }, { id: 10021, linked: false }),
      );

      expect(await tecdoc.getLinkedTargetIds(555)).toEqual([10020]);
    });

    // A part with no catalogued linkages is an ordinary status-200 response
    // with the collection simply absent.
    it('reads an omitted linkage collection as no linkages', async () => {
      call.mockResolvedValueOnce({ status: 200 });

      expect(await tecdoc.getLinkedTargetIds(555)).toEqual([]);
    });
  });

  describe('getLinkageTargets', () => {
    it('hydrates bare target ids into vehicle rows', async () => {
      call.mockResolvedValueOnce({
        linkageTargets: [
          {
            linkageTargetId: 10020,
            mfrName: 'BMW',
            vehicleModelSeriesName: '3 Series (E90)',
            description: '320d',
          },
        ],
      });

      const result = await tecdoc.getLinkageTargets([10020]);

      expect(call).toHaveBeenCalledWith(
        'getLinkageTargets',
        expect.objectContaining({
          linkageTargetType: 'P',
          linkageTargetIds: [{ type: 'P', id: 10020 }],
        }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          vehicleId: '10020',
          manufacturerName: 'BMW',
        }),
      ]);
    });

    it('reads an omitted target collection as no vehicles', async () => {
      call.mockResolvedValueOnce({});

      expect(await tecdoc.getLinkageTargets([10020])).toEqual([]);
    });
  });
});
