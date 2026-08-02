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

    // TecDoc omits a field rather than sending a zero, and the lane resolver
    // reads `total > 0` to decide a lane matched — so an absent total would
    // discard a page that did come back with articles.
    it('falls back to the page size when TecDoc omits the total', async () => {
      call.mockResolvedValueOnce({
        articles: [record('WL6340'), record('WL6341')],
      });

      const result = await tecdoc.searchArticles('WL634', undefined, {
        type: 10,
        matchType: 'prefix_or_suffix',
      });

      expect(result.total).toBe(2);
    });

    it('reports a zero total for an empty page with no total', async () => {
      call.mockResolvedValueOnce({});

      const result = await tecdoc.searchArticles('WL634', undefined, {
        type: 10,
        matchType: 'prefix_or_suffix',
      });

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
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
        1,
        { type: 10, matchType: 'exact' },
        1,
        50,
        {
          brandIds: [4, 7],
          categoryNodeId: 100,
          categoryHasChildren: false,
          criteria: [{ criteriaId: 20, rawValue: '106.4' }],
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

    it('does not request criteria facets for a category with no leaf hint', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 0,
        articles: [],
      });

      await tecdoc.searchArticles('WL634', undefined, { type: 10 }, 1, 50, {
        categoryNodeId: 100,
      });

      const params = call.mock.calls[0][1];
      expect(params).toMatchObject({ assemblyGroupNodeIds: [100] });
      expect(params).not.toHaveProperty('includeCriteriaFacets');
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
        { categoryNodeId: 100, categoryHasChildren: false },
      );

      expect(result.attributes).toHaveLength(1);
      expect(result.attributes[0]).toMatchObject({ id: '20', label: 'Width' });
      expect(result.categoryNavigation.current).toMatchObject({ id: '100' });
    });

    it('does not request criteria facets when the client reports a non-leaf category', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 0,
        articles: [],
      });

      await tecdoc.searchArticles('brake', undefined, { type: 99 }, 1, 50, {
        categoryNodeId: 100,
        categoryHasChildren: true,
      });

      const params = call.mock.calls[0][1];
      expect(params).toMatchObject({ assemblyGroupNodeIds: [100] });
      expect(params).not.toHaveProperty('includeCriteriaFacets');
    });

    it('drops criteria facets when the client wrongly claimed a leaf, as a backstop', async () => {
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
        assemblyGroupFacets: {
          counts: [
            {
              assemblyGroupNodeId: 100,
              assemblyGroupName: 'Brakes',
              parentNodeId: null,
              childCount: 3,
            },
          ],
        },
      });

      // The client asked for dimensions, but TecDoc reports the node has
      // children — the response gate must win over the hint.
      const result = await tecdoc.searchArticles(
        'brake',
        undefined,
        { type: 99 },
        1,
        50,
        { categoryNodeId: 100, categoryHasChildren: false },
      );

      expect(call.mock.calls[0][1]).toMatchObject({
        includeCriteriaFacets: true,
      });
      expect(result.categoryNavigation.current).toMatchObject({
        hasChildren: true,
      });
      expect(result.attributes).toEqual([]);
    });

    it('does not re-request criteria facets beyond the first page', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 0,
        articles: [],
      });

      await tecdoc.searchArticles(
        'WL634',
        undefined,
        { type: 10, matchType: 'prefix_or_suffix' },
        2,
        50,
        { categoryNodeId: 100, categoryHasChildren: false },
      );

      const params = call.mock.calls[0][1];
      expect(params.page).toBe(2);
      expect(params).not.toHaveProperty('includeCriteriaFacets');
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

  describe('getAutocompleteArticles', () => {
    function articleRecord(articleNumber: string, description = 'Oil Filter') {
      return {
        articleNumber,
        dataSupplierId: 268,
        mfrName: 'WIX',
        genericArticles: [{ genericArticleDescription: description }],
      };
    }

    function facet(
      assemblyGroupNodeId: number,
      assemblyGroupName: string,
      extra: {
        parentNodeId?: number | null;
        childCount?: number;
        count?: number;
      } = {},
    ) {
      return { assemblyGroupNodeId, assemblyGroupName, ...extra };
    }

    it('runs a prefix number search capped at 8, requesting the category facet, and maps to article suggestions', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [articleRecord('WL6340')],
      });

      const result = await tecdoc.getAutocompleteArticles('WL63');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({
          searchType: 10,
          searchMatchType: 'prefix',
          perPage: 8,
          assemblyGroupFacetOptions: {
            enabled: true,
            assemblyGroupType: 'P',
            includeCompleteTree: false,
          },
        }),
      );
      // The brand id rides along so the suggestion can deep-link the part: the
      // number alone does not identify one.
      expect(result).toEqual([
        {
          kind: 'article',
          articleNumber: 'WL6340',
          brandId: '268',
          brandName: 'WIX',
          description: 'Oil Filter',
        },
      ]);
    });

    it('forwards an exact match type when the exact execution is used', async () => {
      call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

      await tecdoc.getAutocompleteArticles('WL6340', {
        type: 10,
        matchType: 'exact',
      });

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({ searchType: 10, searchMatchType: 'exact' }),
      );
    });

    it('appends leaf category suggestions (sorted by count) when the matches span multiple categories', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 92,
        articles: [articleRecord('WP2-8.00-10', 'Спирачна тръбичка')],
        assemblyGroupFacets: {
          counts: [
            // Parent node: has children → dropped from the suggestions.
            facet(100006, 'Спирачна система', { childCount: 2, count: 59 }),
            facet(100256, 'Спирачна тръбичка', {
              parentNodeId: 100006,
              count: 41,
            }),
            facet(100412, 'Филтър на купе', { count: 33 }),
          ],
        },
      });

      const result = await tecdoc.getAutocompleteArticles('WP2');

      expect(result[0].kind).toBe('article');
      expect(result.filter((item) => item.kind === 'category')).toEqual([
        {
          kind: 'category',
          term: 'WP2',
          categoryNodeId: '100256',
          label: 'Спирачна тръбичка',
          count: 41,
        },
        {
          kind: 'category',
          term: 'WP2',
          categoryNodeId: '100412',
          label: 'Филтър на купе',
          count: 33,
        },
      ]);
    });

    it('omits category suggestions when the matches fall in a single category', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 8,
        articles: [articleRecord('OX982D', 'Маслен филтър')],
        assemblyGroupFacets: {
          counts: [facet(200002, 'Маслен филтър', { count: 8 })],
        },
      });

      const result = await tecdoc.getAutocompleteArticles('OX 9');

      expect(result.every((item) => item.kind === 'article')).toBe(true);
    });

    it('caps category suggestions at the limit', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 60,
        articles: [articleRecord('A1')],
        assemblyGroupFacets: {
          counts: Array.from({ length: 7 }, (_, i) =>
            facet(i + 1, `Category ${i}`, { count: 7 - i }),
          ),
        },
      });

      const result = await tecdoc.getAutocompleteArticles('A');

      expect(result.filter((item) => item.kind === 'category')).toHaveLength(5);
    });

    it('tolerates a missing assemblyGroupFacets block', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [articleRecord('WL6340')],
      });

      const result = await tecdoc.getAutocompleteArticles('WL63');

      expect(result.every((item) => item.kind === 'article')).toBe(true);
    });
  });

  describe('getAutocompleteTerms', () => {
    it('calls getAutoCompleteSuggestions and maps descriptions to term suggestions', async () => {
      call.mockResolvedValueOnce({
        suggestions: [
          { description: 'Oil Filter' },
          { description: 'Oil Filter Housing' },
        ],
      });

      const result = await tecdoc.getAutocompleteTerms('oil');

      expect(call).toHaveBeenCalledWith(
        'getAutoCompleteSuggestions',
        expect.objectContaining({ searchQuery: 'oil', perPage: 8 }),
      );
      expect(result).toEqual([
        { kind: 'term', term: 'Oil Filter' },
        { kind: 'term', term: 'Oil Filter Housing' },
      ]);
    });

    it('tolerates a missing suggestions array', async () => {
      call.mockResolvedValueOnce({});

      const result = await tecdoc.getAutocompleteTerms('oil');

      expect(result).toEqual([]);
    });
  });
});
