import { ArticleAutocompleteItemDto } from '@vp-parts-shop/shared';
import { TecDocMockClient } from './tecdoc-mock-client';
import { TecDocSearchType } from '../search/search-types';

describe('TecDocMockClient', () => {
  let mock: TecDocMockClient;

  beforeEach(() => {
    mock = new TecDocMockClient();
  });

  describe('searchArticles', () => {
    it('matches on article number (number search) and returns brand facets', async () => {
      const result = await mock.searchArticles('OX 982D');

      expect(result.total).toBeGreaterThan(0);
      expect(
        result.items.some((item) => item.articleNumber === 'OX 982D'),
      ).toBe(true);
      expect(result.facets[0]?.id).toBe('brands');
    });

    it('matches on shared OE number so one query returns multiple brands', async () => {
      const result = await mock.searchArticles('06J 115 403 Q');

      const numbers = result.items.map((item) => item.articleNumber);
      expect(numbers).toEqual(
        expect.arrayContaining(['OF-OC115', 'OF-WL7090']),
      );
    });

    it('matches on description words for a free-text search', async () => {
      const result = await mock.searchArticles('oil filter mann', undefined, {
        type: TecDocSearchType.FreeText,
      });

      expect(result.total).toBeGreaterThan(0);
      expect(
        result.items.every((item) =>
          item.description.toLowerCase().includes('oil filter'),
        ),
      ).toBe(true);
    });

    it('surfaces attribute facets only once a leaf category is selected', async () => {
      const broad = await mock.searchArticles('Brake Pad');
      expect(broad.attributes).toEqual([]);

      const scoped = await mock.searchArticles('Brake Pad', undefined, {
        type: TecDocSearchType.FreeText,
        matchType: undefined,
      });
      // A category selection narrows to a leaf and reveals the attributes.
      const leaf = await mock.searchArticles(
        'Brake Pad',
        undefined,
        { type: TecDocSearchType.FreeText },
        1,
        50,
        { categoryNodeId: 'Brake Pad Set, disc brake' },
      );
      expect(scoped.attributes).toEqual([]);
      expect(leaf.attributes.length).toBeGreaterThan(0);
    });
  });

  describe('getAutocompleteArticles', () => {
    function articlesOf(
      items: Awaited<ReturnType<TecDocMockClient['getAutocompleteArticles']>>,
    ) {
      return items.filter(
        (item): item is ArticleAutocompleteItemDto => item.kind === 'article',
      );
    }

    it('returns at most 8 matching article suggestions', async () => {
      const result = await mock.getAutocompleteArticles('O');
      const articles = articlesOf(result);

      expect(articles.length).toBeLessThanOrEqual(8);
      expect(articles[0]).toMatchObject({ kind: 'article' });
      expect(articles[0]).toHaveProperty('articleNumber');
      expect(articles[0]).toHaveProperty('brandName');
    });

    it('keeps only exact number matches for an exact execution', async () => {
      const exact = await mock.getAutocompleteArticles('OX 982D', {
        type: TecDocSearchType.AnyNumber,
        matchType: 'exact',
      });
      expect(articlesOf(exact).map((item) => item.articleNumber)).toEqual([
        'OX 982D',
      ]);

      // A partial number matches nothing under the exact strategy.
      const partial = await mock.getAutocompleteArticles('OX 98', {
        type: TecDocSearchType.AnyNumber,
        matchType: 'exact',
      });
      expect(partial).toEqual([]);
    });

    it('appends category suggestions when the matches span multiple categories', async () => {
      const result = await mock.getAutocompleteArticles('O');

      const categories = result.filter((item) => item.kind === 'category');
      expect(categories.length).toBeGreaterThan(0);
      expect(categories.length).toBeLessThanOrEqual(5);
      expect(categories[0]).toMatchObject({ kind: 'category', term: 'O' });
      expect(categories[0]).toHaveProperty('categoryNodeId');
    });

    it('omits category suggestions for an exact single-category match', async () => {
      const exact = await mock.getAutocompleteArticles('OX 982D', {
        type: TecDocSearchType.AnyNumber,
        matchType: 'exact',
      });

      expect(exact.every((item) => item.kind === 'article')).toBe(true);
    });
  });

  describe('getAutocompleteTerms', () => {
    it('returns distinct description terms matching the input', async () => {
      const result = await mock.getAutocompleteTerms('oil');

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(8);
      expect(result[0]).toMatchObject({ kind: 'term' });
      expect(result.every((item) => item.term.length > 0)).toBe(true);
      // Distinct terms only — no duplicate description strings.
      const terms = result.map((item) => item.term);
      expect(new Set(terms).size).toBe(terms.length);
    });
  });
});
