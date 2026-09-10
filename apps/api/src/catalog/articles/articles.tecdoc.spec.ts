import { Logger } from '@nestjs/common';
import { TecDocTransport } from '../../tecdoc';
import { ArticleNotFoundException } from './article-not-found.exception';
import { ArticlesTecDoc } from './articles.tecdoc';

const BOSCH = 30;
const BRAKE_DISC = 82;

function record(
  articleNumber: string,
  overrides: {
    dataSupplierId?: number;
    mfrName?: string;
    genericArticleId?: number;
  } = {},
) {
  const {
    dataSupplierId = BOSCH,
    mfrName = 'Bosch',
    genericArticleId = BRAKE_DISC,
  } = overrides;

  return {
    articleNumber,
    dataSupplierId,
    mfrName,
    genericArticles: [
      {
        genericArticleId,
        genericArticleDescription: 'Part',
        legacyArticleId: 555,
      },
    ],
    images: [{ imageURL800: `https://img/${articleNumber}.jpg` }],
  };
}

describe('ArticlesTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: ArticlesTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new ArticlesTecDoc({ call } as unknown as TecDocTransport);
  });

  describe('getArticleDetails', () => {
    it('maps the article with its image gallery', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      const { detail } = await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(detail.images).toEqual(['https://img/A1.jpg']);
      expect(detail.brandId).toBe('30');
    });

    // One row, so the saving is small — but the detail page is the one surface
    // that renders OE numbers, which is why this read asks for them and no list
    // read does.
    it('asks for the detail fields, OE numbers included', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      await tecdoc.getArticleDetails(BOSCH, 'A1');

      const [, params] = call.mock.calls[0];
      expect(params).toMatchObject({
        includeGenericArticles: true,
        includeImages: true,
        includeArticleCriteria: true,
        includeOEMNumbers: true,
      });
      expect(params).not.toHaveProperty('includeAll');
    });

    /**
     * What the part *is* is not on the DTO — nothing renders it — but the
     * cross-reference search filters on it, and this read is the only one that
     * knows it. Carrying it beside the DTO is what saves that search a lookup of
     * its own.
     */
    it('carries the generic article ids beside the DTO', async () => {
      call.mockResolvedValueOnce({
        articles: [
          {
            ...record('A1'),
            genericArticles: [
              { genericArticleId: 82, legacyArticleId: 555 },
              { genericArticleId: 91, legacyArticleId: 556 },
            ],
          },
        ],
      });

      const { genericArticleIds } = await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(genericArticleIds).toEqual([82, 91]);
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

    // The trail comes off the same call as the article — TecDoc will not answer
    // a facet without being told which tree, because a lookup by number carries
    // no linkage for it to infer one from.
    it('asks for the category facet, naming both trees', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      await tecdoc.getArticleDetails(BOSCH, 'A1');

      const [, params] = call.mock.calls[0];
      expect(params).toMatchObject({
        assemblyGroupFacetOptions: {
          enabled: true,
          assemblyGroupType: 'PU',
        },
      });
    });

    it('maps every category trail the article sits on', async () => {
      call.mockResolvedValueOnce({
        articles: [record('A1')],
        assemblyGroupFacets: {
          counts: [
            { assemblyGroupNodeId: 100005, assemblyGroupName: 'филтър' },
            {
              assemblyGroupNodeId: 100259,
              assemblyGroupName: 'маслен филтър',
              parentNodeId: 100005,
            },
            {
              assemblyGroupNodeId: 100597,
              assemblyGroupName: 'Периодична подмяна',
              parentNodeId: 100019,
            },
            {
              assemblyGroupNodeId: 100019,
              assemblyGroupName: 'части за сервиз',
            },
          ],
        },
      });

      const { detail } = await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(
        detail.categoryPaths.map((path) => path.map((step) => step.label)),
      ).toEqual([
        ['филтър', 'маслен филтър'],
        ['части за сервиз', 'Периодична подмяна'],
      ]);
    });

    it('leaves the trail empty when TecDoc files no category', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      const { detail } = await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(detail.categoryPaths).toEqual([]);
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

      const { detail } = await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(detail.brandName).toBe('Bosch Motorsport');
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
});
