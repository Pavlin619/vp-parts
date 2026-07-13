import { TecDocTransport } from '../tecdoc';
import { SearchTecDoc } from './search.tecdoc';

function record(articleNumber: string, mfrName = 'WIX') {
  return {
    articleNumber,
    mfrName,
    genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
  };
}

describe('SearchTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: SearchTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new SearchTecDoc({ call } as unknown as TecDocTransport);
  });

  describe('searchArticles', () => {
    it('sends a number search with match type and maps items + brand facets', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [record('WL6340')],
        dataSupplierFacets: {
          counts: [{ dataSupplierId: 4, mfrName: 'WIX', count: 1 }],
        },
      });

      const result = await tecdoc.searchArticles('WL634', undefined, {
        type: 10,
        matchType: 'prefix_or_suffix',
      });

      const [fn, params] = call.mock.calls[0];
      expect(fn).toBe('getArticles');
      expect(params).toMatchObject({
        searchQuery: 'WL634',
        searchType: 10,
        searchMatchType: 'prefix_or_suffix',
        includeDataSupplierFacets: true,
      });
      // No category selected → criteria facets are not requested.
      expect(params).not.toHaveProperty('includeCriteriaFacets');
      expect(result.items.map((i) => i.articleNumber)).toEqual(['WL6340']);
      expect(result.facets[0]).toMatchObject({ id: 'brands' });
      expect(result.attributes).toEqual([]);
    });

    it('omits the match type for a free-text search', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 0,
        articles: [],
      });

      await tecdoc.searchArticles('oil filter', undefined, { type: 99 });

      const params = call.mock.calls[0][1];
      expect(params.searchType).toBe(99);
      expect(params).not.toHaveProperty('searchMatchType');
    });

    it('scopes to a vehicle and forwards active brand/category/criteria filters', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 0,
        articles: [],
      });

      await tecdoc.searchArticles(
        'WL634',
        '1',
        { type: 10, matchType: 'exact' },
        1,
        50,
        {
          brandIds: ['4', '7'],
          categoryNodeId: '100',
          criteria: [{ criteriaId: '20', rawValue: '106.4' }],
        },
      );

      const params = call.mock.calls[0][1];
      expect(params).toMatchObject({
        linkageTargetId: 1,
        dataSupplierIds: [4, 7],
        assemblyGroupNodeIds: [100],
        includeCriteriaFacets: true,
        criteriaFilters: [{ criteriaId: 20, rawValue: '106.4' }],
      });
    });

    it('surfaces attribute facets only when the selected category is a leaf', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [record('WL6340')],
        criteriaFacets: {
          counts: [
            {
              criteriaId: 20,
              criteriaDescription: 'Width',
              criteriaValues: [
                { rawValue: '106.4', formattedValue: '106.4 mm', count: 1 },
              ],
            },
          ],
        },
        // The selected leaf node is present with no children.
        assemblyGroupFacets: {
          counts: [
            {
              assemblyGroupNodeId: 100,
              assemblyGroupName: 'Filters',
              parentNodeId: null,
            },
          ],
        },
      });

      const result = await tecdoc.searchArticles(
        'WL634',
        undefined,
        { type: 10, matchType: 'prefix_or_suffix' },
        1,
        50,
        { categoryNodeId: '100' },
      );

      expect(result.attributes).toHaveLength(1);
      expect(result.attributes[0]).toMatchObject({ id: '20', label: 'Width' });
      expect(result.categoryNavigation.current).toMatchObject({ id: '100' });
    });

    it('builds root-level category options when nothing is selected', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 2,
        articles: [record('A1'), record('A2')],
        assemblyGroupFacets: {
          counts: [
            {
              assemblyGroupNodeId: 1,
              assemblyGroupName: 'Brakes',
              parentNodeId: null,
              childCount: 2,
            },
            {
              assemblyGroupNodeId: 2,
              assemblyGroupName: 'Discs',
              parentNodeId: 1,
            },
          ],
        },
      });

      const result = await tecdoc.searchArticles('brake', undefined, {
        type: 99,
      });

      expect(result.categoryNavigation.current).toBeNull();
      expect(result.categoryNavigation.options.map((o) => o.id)).toEqual(['1']);
      expect(result.categoryNavigation.options[0].hasChildren).toBe(true);
    });
  });

  describe('getAutocompleteSuggestions', () => {
    it('runs a prefix number search capped at 8 and maps to suggestions', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [
          {
            articleNumber: 'WL6340',
            mfrName: 'WIX',
            genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
          },
        ],
      });

      const result = await tecdoc.getAutocompleteSuggestions('WL63');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({
          searchType: 10,
          searchMatchType: 'prefix',
          perPage: 8,
        }),
      );
      expect(result).toEqual([
        {
          articleNumber: 'WL6340',
          brandName: 'WIX',
          description: 'Oil Filter',
        },
      ]);
    });
  });
});
