import { TecDocTransport } from '../../tecdoc';
import { ArticlesTecDoc, SUBSTITUTES_LIMIT } from './articles.tecdoc';

function record(articleNumber: string, mfrName = 'Bosch') {
  return {
    articleNumber,
    mfrName,
    genericArticles: [{ genericArticleDescription: 'Part' }],
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

      const result = await tecdoc.getArticles('10001', '100002', 1, 20);

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
  });

  describe('getArticleDetails', () => {
    it('maps the first article with its image gallery', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      const result = await tecdoc.getArticleDetails('A1');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({ searchQuery: 'A1', searchType: 0 }),
      );
      expect(result.images).toEqual(['https://img/A1.jpg']);
      expect(result.compatibleVehicles).toEqual([]);
    });

    it('throws when TecDoc returns no article', async () => {
      call.mockResolvedValueOnce({ articles: [] });

      await expect(tecdoc.getArticleDetails('missing')).rejects.toThrow(
        'Article not found: missing',
      );
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
          perPage: SUBSTITUTES_LIMIT,
        }),
      );
      expect(result.map((r) => r.articleNumber)).toEqual(['A1', 'A2']);
    });

    it('returns an empty list when there are no articles', async () => {
      call.mockResolvedValueOnce({});

      expect(await tecdoc.getSubstitutes('SRC')).toEqual([]);
    });
  });
});
