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

    // `includeAll` also carries PDFs, links, linkages, parts lists, accessory
    // lists, GTINs, prices and trade numbers, none of which a result row shows.
    // OE numbers are excluded too — the row reads them from the part-numbers
    // endpoint when a visitor opens that section.
    it('asks only for the fields a result row renders', async () => {
      call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

      await tecdoc.searchArticles('WL634', undefined, {
        type: 10,
        matchType: 'prefix_or_suffix',
      });

      const [, params] = call.mock.calls[0];
      expect(params).toMatchObject({
        includeGenericArticles: true,
        includeImages: true,
        includeArticleCriteria: true,
      });
      for (const flag of ['includeAll', 'includeOEMNumbers', 'includeMisc']) {
        expect(params).not.toHaveProperty(flag);
      }
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

    // TecDoc serves only the first ~10,000 results of a match set, so a broad
    // query's page count is its `maxAllowedPage` and not `total / pageSize`.
    describe('maxPage', () => {
      it("takes TecDoc's cap when it is below the match count", async () => {
        call.mockResolvedValueOnce({
          totalMatchingArticles: 50_000,
          maxAllowedPage: 500,
          articles: [record('WL6340')],
        });

        const result = await tecdoc.searchArticles(
          'филтър',
          undefined,
          { type: 99 },
          1,
          20,
        );

        expect(result.maxPage).toBe(500);
      });

      it('takes the match count when it is below the cap', async () => {
        call.mockResolvedValueOnce({
          totalMatchingArticles: 87,
          maxAllowedPage: 500,
          articles: [record('WL6340')],
        });

        const result = await tecdoc.searchArticles(
          'филтър',
          undefined,
          { type: 99 },
          1,
          20,
        );

        expect(result.maxPage).toBe(5);
      });

      it('falls back to the match count when TecDoc omits the cap', async () => {
        call.mockResolvedValueOnce({
          totalMatchingArticles: 87,
          articles: [record('WL6340')],
        });

        const result = await tecdoc.searchArticles(
          'филтър',
          undefined,
          { type: 99 },
          1,
          20,
        );

        expect(result.maxPage).toBe(5);
      });

      it('reports no pages at all for an empty match set', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        const result = await tecdoc.searchArticles(
          'филтър',
          undefined,
          { type: 99 },
          1,
          20,
        );

        expect(result.maxPage).toBe(0);
      });
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

    // TecDoc files universal parts — oils, wipers, workshop consumables — in
    // their own assembly group tree, and concatenating the codes is how one
    // call spans both.
    describe('the tree the category facet spans', () => {
      it('covers the universal tree too when the search is catalogue-wide', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('масло', undefined, { type: 99 });

        expect(call.mock.calls[0][1]).toMatchObject({
          assemblyGroupFacetOptions: {
            enabled: true,
            assemblyGroupType: 'PU',
            includeCompleteTree: false,
          },
        });
      });

      // Naming a tree under a linkage would mean re-deriving TecDoc's own
      // mapping by hand, and the two vocabularies do not line up: linkage 'P'
      // covers motorcycles where tree 'P' excludes them, so the obvious pairing
      // silently drops the linkage's motorcycle groups.
      it('leaves the tree to TecDoc when the search is scoped to a vehicle', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('масло', 20154, { type: 99 });

        const payload = call.mock.calls[0][1] as {
          assemblyGroupFacetOptions: Record<string, unknown>;
        };

        expect(payload).toMatchObject({ linkageTargetId: 20154 });
        expect(payload.assemblyGroupFacetOptions).toEqual({
          enabled: true,
          includeCompleteTree: false,
        });
      });
    });

    // The schema documents the flag as "Always return the complete tree back,
    // even if other assemblyGroupsIds are being filtered", so without it a
    // filtered facet is anchored on the selected node and cannot name what sits
    // above it — which is the breadcrumb's whole trail.
    describe('the tree depth the category facet is asked for', () => {
      it('asks for the complete tree once a category narrows the search', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('масло', undefined, { type: 99 }, 1, 50, {
          categoryNodeId: 100,
        });

        expect(call.mock.calls[0][1]).toMatchObject({
          assemblyGroupFacetOptions: { includeCompleteTree: true },
        });
      });

      // An unnarrowed search already gets the roots it needs, and the whole
      // catalogue tree would be paid for on every broad query.
      it('leaves it off while no category is selected', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('масло', undefined, { type: 99 });

        expect(call.mock.calls[0][1]).toMatchObject({
          assemblyGroupFacetOptions: { includeCompleteTree: false },
        });
      });

      it('asks for it under a vehicle scope too', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('масло', 20154, { type: 99 }, 1, 50, {
          categoryNodeId: 100,
        });

        expect(call.mock.calls[0][1]).toMatchObject({
          assemblyGroupFacetOptions: {
            enabled: true,
            includeCompleteTree: true,
          },
        });
      });
    });

    // TecDoc's generic article is what the part *is* ("Oil Filter"), the axis
    // it defines every technical criterion against.
    describe('the product-type facet', () => {
      it('is always requested and mapped alongside the brand group', async () => {
        call.mockResolvedValueOnce({
          totalMatchingArticles: 1,
          articles: [record('WL6340')],
          dataSupplierFacets: {
            counts: [{ dataSupplierId: 4, mfrName: 'WIX', count: 1 }],
          },
          genericArticleFacets: {
            counts: [
              {
                genericArticleId: 7,
                genericArticleDescription: 'Маслен филтър',
                count: 1,
              },
            ],
          },
        });

        const result = await tecdoc.searchArticles('филтър', undefined, {
          type: 99,
        });

        expect(call.mock.calls[0][1]).toMatchObject({
          includeGenericArticleFacets: true,
        });
        expect(result.facets.map((facet) => facet.id)).toEqual([
          'brands',
          'productTypes',
        ]);
        expect(result.facets[1].values).toEqual([
          { id: '7', label: 'Маслен филтър', count: 1 },
        ]);
      });

      it('forwards a selection as genericArticleIds', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('филтър', undefined, { type: 99 }, 1, 50, {
          productTypeIds: [7, 9],
        });

        expect(call.mock.calls[0][1]).toMatchObject({
          genericArticleIds: [7, 9],
        });
      });

      // The point of the whole facet: one product type is a homogeneous set, so
      // dimensions become available without drilling the category tree at all.
      it('opens the criteria gate on its own when exactly one is selected', async () => {
        call.mockResolvedValueOnce({
          totalMatchingArticles: 1,
          articles: [record('WL6340')],
          criteriaFacets: {
            counts: [
              {
                criteria: {
                  criteriaId: 20,
                  criteriaDescription: 'Width',
                  criteriaType: 'N',
                  isInterval: false,
                },
                criteriaValueCounts: [
                  { rawValue: '106.4', formattedValue: '106.4 mm', count: 1 },
                ],
              },
            ],
          },
        });

        const result = await tecdoc.searchArticles(
          'филтър',
          undefined,
          { type: 99 },
          1,
          50,
          { productTypeIds: [7] },
        );

        expect(call.mock.calls[0][1]).toMatchObject({
          includeCriteriaFacets: true,
        });
        expect(result.attributes).toHaveLength(1);
        expect(result.attributes[0]).toMatchObject({ id: '20' });
      });

      // Two types are a union of two criteria sets, which is not a dimension
      // list anyone can filter on.
      it('leaves the criteria gate shut when several are selected', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('филтър', undefined, { type: 99 }, 1, 50, {
          productTypeIds: [7, 9],
        });

        expect(call.mock.calls[0][1]).not.toHaveProperty(
          'includeCriteriaFacets',
        );
      });

      // DQM is what stops the dimension list offering values that cannot
      // apply to the selected product type and so lead nowhere.
      it('asks TecDoc to drop impermissible criteria values', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('филтър', undefined, { type: 99 }, 1, 50, {
          productTypeIds: [7],
        });

        expect(call.mock.calls[0][1]).toMatchObject({ applyDqmRules: true });
      });

      // The schema gates DQM on exactly one genericArticleId, so anything
      // broader has to go without it.
      it('withholds the DQM rules when several types are selected', async () => {
        call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

        await tecdoc.searchArticles('филтър', undefined, { type: 99 }, 1, 50, {
          productTypeIds: [7, 9],
        });

        expect(call.mock.calls[0][1]).not.toHaveProperty('applyDqmRules');
      });
    });

    // A leaf category opens the dimension list without narrowing to one
    // generic article, so it does not meet the DQM precondition.
    it('withholds the DQM rules for a leaf category alone', async () => {
      call.mockResolvedValueOnce({ totalMatchingArticles: 0, articles: [] });

      await tecdoc.searchArticles('филтър', undefined, { type: 99 }, 1, 50, {
        categoryNodeId: 100,
        categoryHasChildren: false,
      });

      const params = call.mock.calls[0][1];
      expect(params).toMatchObject({ includeCriteriaFacets: true });
      expect(params).not.toHaveProperty('applyDqmRules');
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
              criteria: {
                criteriaId: 20,
                criteriaDescription: 'Width',
                criteriaUnitDescription: 'mm',
                criteriaType: 'N',
                isInterval: false,
              },
              criteriaValueCounts: [
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
              criteria: {
                criteriaId: 20,
                criteriaDescription: 'Width',
                criteriaType: 'N',
                isInterval: false,
              },
              criteriaValueCounts: [
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
              children: 3,
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
              children: 2,
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
        children?: number;
        count?: number;
      } = {},
    ) {
      return { assemblyGroupNodeId, assemblyGroupName, ...extra };
    }

    // The description comes from `genericArticles`, which TecDoc only sends
    // when asked: the schema defaults `includeGenericArticles` to false and
    // marks the array optional. Without the flag every suggestion would come
    // back nameless.
    it('asks for the generic-article data the description is read from', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [articleRecord('WL6340')],
      });

      await tecdoc.getAutocompleteArticles('WL63');

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({ includeGenericArticles: true }),
      );
    });

    // A part TecDoc files no generic article against still has a number and a
    // brand worth suggesting, so an absent array is a blank description — not
    // a thrown request that takes the whole dropdown down with it.
    it('survives a record with no generic articles at all', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [
          { articleNumber: 'WL6340', dataSupplierId: 268, mfrName: 'WIX' },
        ],
      });

      const result = await tecdoc.getAutocompleteArticles('WL63');

      expect(result).toEqual([
        {
          kind: 'article',
          articleNumber: 'WL6340',
          brandId: '268',
          brandName: 'WIX',
          description: '',
        },
      ]);
    });

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
          // Never vehicle-scoped, so the dropdown can suggest a universal
          // category ("Двигателно масло") as readily as a passenger-car one.
          assemblyGroupFacetOptions: {
            enabled: true,
            assemblyGroupType: 'PU',
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
            facet(100006, 'Спирачна система', { children: 2, count: 59 }),
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
    it('maps the plain suggestion strings to term suggestions', async () => {
      call.mockResolvedValueOnce({
        suggestions: ['Oil Filter', 'Oil Filter Housing'],
      });

      const result = await tecdoc.getAutocompleteTerms('oil');

      expect(result).toEqual([
        { kind: 'term', term: 'Oil Filter' },
        { kind: 'term', term: 'Oil Filter Housing' },
      ]);
    });

    // The function's whole request is provider + lang + searchQuery; sending
    // getArticles' country and paging params would be inventing a contract.
    it('sends only the params the function accepts', async () => {
      call.mockResolvedValueOnce({ suggestions: [] });

      await tecdoc.getAutocompleteTerms('oil');

      expect(call).toHaveBeenCalledWith('getAutoCompleteSuggestions', {
        lang: 'bg',
        searchQuery: 'oil',
      });
    });

    // TecDoc has no paging on this function, so the dropdown's cap can only be
    // applied to what it sends back.
    it('caps the suggestions locally', async () => {
      call.mockResolvedValueOnce({
        suggestions: Array.from({ length: 12 }, (_, i) => `Term ${i}`),
      });

      const result = await tecdoc.getAutocompleteTerms('oil');

      expect(result).toHaveLength(8);
    });

    it('tolerates a missing suggestions array', async () => {
      call.mockResolvedValueOnce({});

      const result = await tecdoc.getAutocompleteTerms('oil');

      expect(result).toEqual([]);
    });
  });
});
