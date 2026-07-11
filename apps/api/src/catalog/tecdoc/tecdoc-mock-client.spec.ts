import { TecDocMockClient } from './tecdoc-mock-client';

describe('TecDocMockClient', () => {
  let client: TecDocMockClient;

  beforeEach(() => {
    client = new TecDocMockClient();
  });

  describe('searchArticles', () => {
    it('matches on an article-number substring', async () => {
      const { items } = await client.searchArticles('OF');

      const numbers = items.map((article) => article.articleNumber);
      expect(numbers).toEqual(
        expect.arrayContaining(['OF-OC115', 'OF-WL7090', 'OF-HU816X']),
      );
    });

    it('returns a single article for a full article number', async () => {
      const result = await client.searchArticles('BD-0986478451');

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleNumber).toBe('BD-0986478451');
    });

    it('matches on an OE number shared across brands (searchType 10)', async () => {
      const { items } = await client.searchArticles('06J 115 403 Q');

      const numbers = items.map((article) => article.articleNumber);
      expect(numbers).toEqual(
        expect.arrayContaining(['OF-OC115', 'OF-WL7090']),
      );
      expect(items.length).toBeGreaterThan(1);
    });

    it('ignores spaces, hyphens and dots in the OE query', async () => {
      const spaced = await client.searchArticles('06J 115 403 Q');
      const compact = await client.searchArticles('06J115403Q');

      expect(compact.items.map((a) => a.articleNumber)).toEqual(
        spaced.items.map((a) => a.articleNumber),
      );
    });

    it('returns no matches for an unknown number', async () => {
      const result = await client.searchArticles('does-not-exist');

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('paginates the matches', async () => {
      const all = await client.searchArticles('OF');
      const firstPage = await client.searchArticles(
        'OF',
        undefined,
        'exact',
        1,
        1,
      );

      expect(firstPage.total).toBe(all.total);
      expect(firstPage.pageSize).toBe(1);
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.items[0].articleNumber).toBe(all.items[0].articleNumber);
    });

    it('returns a subset when scoped to a vehicle', async () => {
      const all = await client.searchArticles('OF');
      const scoped = await client.searchArticles('OF', '10001');

      expect(scoped.items.length).toBeLessThan(all.items.length);
      expect(scoped.items.length).toBeGreaterThan(0);
    });

    it('builds brand and category facets over the matched set', async () => {
      const { facets } = await client.searchArticles('OF');

      const brands = facets.find((facet) => facet.id === 'brands');
      const categories = facets.find((facet) => facet.id === 'categories');

      const totalBrandCount = brands!.values.reduce(
        (sum, v) => sum + v.count,
        0,
      );
      const oilFilterCategory = categories!.values.find(
        (value) => value.label === 'Oil Filter',
      );

      expect(brands!.values.map((v) => v.label)).toEqual(
        expect.arrayContaining(['MANN-FILTER', 'WIX Filters']),
      );
      expect(oilFilterCategory).toBeDefined();
      expect(totalBrandCount).toBeGreaterThan(0);
    });

    it('narrows the results and totals to the selected brand facet', async () => {
      const all = await client.searchArticles('OF');
      const filtered = await client.searchArticles(
        'OF',
        undefined,
        'prefix_or_suffix',
        1,
        50,
        { brandIds: ['WIX Filters'] },
      );

      expect(filtered.total).toBeLessThan(all.total);
      expect(
        filtered.items.every((item) => item.brandName === 'WIX Filters'),
      ).toBe(true);
      expect(filtered.facets.find((f) => f.id === 'brands')!.values).toEqual([
        {
          id: 'WIX Filters',
          label: 'WIX Filters',
          count: filtered.total,
          imageUrl: null,
        },
      ]);
    });

    it('returns no facets when nothing matches', async () => {
      const result = await client.searchArticles('does-not-exist');

      expect(result.facets).toEqual([]);
    });
  });

  describe('getAutocompleteSuggestions', () => {
    it('returns matching suggestions by article number', async () => {
      const suggestions = await client.getAutocompleteSuggestions('OF');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toEqual(
        expect.objectContaining({
          articleNumber: expect.any(String),
          brandName: expect.any(String),
          description: expect.any(String),
        }),
      );
    });

    it('caps suggestions at 8 items', async () => {
      const suggestions = await client.getAutocompleteSuggestions('TEST');

      expect(suggestions.length).toBeLessThanOrEqual(8);
    });
  });
});
