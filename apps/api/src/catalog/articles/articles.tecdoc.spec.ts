import { Logger } from '@nestjs/common';
import { TecDocTransport } from '../../tecdoc';
import { ArticleNotFoundException } from './article-not-found.exception';
import { ArticlesTecDoc, COMPARABLE_PAGE_SIZE } from './articles.tecdoc';

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
      expect(result.articles.total).toBe(2);
      expect(result.articles.items.map((i) => i.articleNumber)).toEqual([
        'A1',
        'A2',
      ]);
    });

    // The ids the applicable-vehicles section needs ride along on every
    // `includeAll` response. Dropping them here is what used to make that
    // section re-read each article through `getLegacyArticleIds`.
    it('returns each row\u2019s linkage roles beside the page', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 2,
        articles: [
          record('A1'),
          {
            ...record('A2', { dataSupplierId: 77 }),
            genericArticles: [
              { genericArticleDescription: 'Filter', legacyArticleId: 900 },
              { genericArticleDescription: 'Filter set', legacyArticleId: 901 },
            ],
          },
        ],
      });

      const { roles } = await tecdoc.getArticles(10001, 100002, 1, 20);

      expect(roles).toEqual([
        { brandId: '30', articleNumber: 'A1', legacyArticleIds: [555] },
        { brandId: '77', articleNumber: 'A2', legacyArticleIds: [900, 901] },
      ]);
    });

    it('reports no roles for a row TecDoc files no generic article against', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [{ ...record('A1'), genericArticles: undefined }],
      });

      const { roles } = await tecdoc.getArticles(10001, 100002, 1, 20);

      expect(roles).toEqual([
        { brandId: '30', articleNumber: 'A1', legacyArticleIds: [] },
      ]);
    });

    // A category with no parts for this vehicle is an ordinary status-200
    // response with the `articles` key omitted, not an error and not `[]`.
    it('returns an empty page when TecDoc omits the articles collection', async () => {
      call.mockResolvedValueOnce({ totalMatchingArticles: 0, status: 200 });

      const result = await tecdoc.getArticles(10001, 100002, 1, 20);

      expect(result).toEqual({
        articles: { total: 0, page: 1, pageSize: 20, items: [] },
        roles: [],
      });
    });
  });

  describe('getArticleDetails', () => {
    it('maps the article with its image gallery', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      const result = await tecdoc.getArticleDetails(BOSCH, 'A1');

      expect(result.images).toEqual(['https://img/A1.jpg']);
      expect(result.brandId).toBe('30');
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

  describe('getComparableArticles', () => {
    it('uses comparable search (type 3) and caps the page', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      await tecdoc.getComparableArticles('SRC');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({
          searchType: 3,
          searchMatchType: 'exact',
          perPage: COMPARABLE_PAGE_SIZE,
        }),
      );
    });

    // TecDoc lists the same record once per data variant of the article.
    it('drops a record TecDoc reports twice', async () => {
      call.mockResolvedValueOnce({
        articles: [record('A1'), record('A1'), record('A2')],
      });

      const result = await tecdoc.getComparableArticles('SRC');

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

      const result = await tecdoc.getComparableArticles('SRC');

      expect(result.map((r) => r.brandName)).toEqual(['Bosch', 'MANN-FILTER']);
    });

    // Whether the searched part belongs in the list is a decision about the
    // list, so it is the service's to make — this read reports what TecDoc said.
    it('reports the searched article like any other comparable row', async () => {
      call.mockResolvedValueOnce({
        articles: [record('SRC'), record('A1')],
      });

      const result = await tecdoc.getComparableArticles('SRC');

      expect(result.map((r) => r.articleNumber)).toEqual(['SRC', 'A1']);
    });

    // Sending `dataSupplierIds` here would filter the results down to the one
    // brand we already have — the opposite of a cross-reference list.
    it('does not narrow the comparable search to a brand', async () => {
      call.mockResolvedValueOnce({ articles: [] });

      await tecdoc.getComparableArticles('SRC');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.not.objectContaining({ dataSupplierIds: expect.anything() }),
      );
    });

    it('returns an empty list when there are no articles', async () => {
      call.mockResolvedValueOnce({});

      expect(await tecdoc.getComparableArticles('SRC')).toEqual([]);
    });
  });
});
