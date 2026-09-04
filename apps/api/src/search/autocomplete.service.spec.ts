import {
  ArticleAutocompleteItemDto,
  CategoryAutocompleteItemDto,
} from '@vp-parts-shop/shared';
import { AutocompleteService } from './autocomplete.service';
import { SearchCache } from './search-cache';
import { SearchTecDoc } from './search.tecdoc';
import { SearchMode } from './search-types';
import { RedisCache } from '../redis';

const getAutocompleteArticlesMock = jest.fn();
const getAutocompleteTermsMock = jest.fn();
const cachedArrayMock = jest.fn();

const mockSearchTecDoc = {
  getAutocompleteArticles: getAutocompleteArticlesMock,
  getAutocompleteTerms: getAutocompleteTermsMock,
} as unknown as SearchTecDoc;

// Transparent cache: each helper runs its loader, so the assertions observe the
// real SearchTecDoc calls. The cache key and TTLs are still asserted directly
// off cachedArrayMock where they matter.
const mockCache = {
  cachedArray: cachedArrayMock,
} as unknown as RedisCache;

// The article-autocomplete executions each mode resolves to: part_number →
// prefix, part_number_exact → exact.
const AC_PREFIX = { type: 10, matchType: 'prefix' } as const;
const AC_EXACT = { type: 10, matchType: 'exact' } as const;

function suggestionItem(articleNumber: string): ArticleAutocompleteItemDto {
  return {
    kind: 'article',
    articleNumber,
    brandId: '268',
    brandName: 'WIX',
    description: 'Oil Filter',
    thumbnailUrl: null,
  };
}

function categorySuggestionItem(
  categoryNodeId: string,
  label = `Category ${categoryNodeId}`,
): CategoryAutocompleteItemDto {
  return {
    kind: 'category',
    term: 'WL63',
    categoryNodeId,
    label,
    count: null,
  };
}

describe('AutocompleteService', () => {
  let service: AutocompleteService;

  beforeEach(() => {
    jest.resetAllMocks();
    cachedArrayMock.mockImplementation(
      (_key: string, _hit: number, _miss: number, loader: () => unknown) =>
        loader(),
    );

    service = new AutocompleteService(
      new SearchCache(mockSearchTecDoc, mockCache),
    );
  });

  describe('autocomplete — the live dropdown', () => {
    it('returns an empty list without calling the catalogue for a single character', async () => {
      const result = await service.autocomplete('W');

      expect(result).toEqual([]);
      expect(getAutocompleteArticlesMock).not.toHaveBeenCalled();
      expect(getAutocompleteTermsMock).not.toHaveBeenCalled();
    });

    it('treats whitespace-padded short input as under the minimum', async () => {
      const result = await service.autocomplete('  W  ');

      expect(result).toEqual([]);
      expect(getAutocompleteArticlesMock).not.toHaveBeenCalled();
    });

    // Two characters is the shared minimum, so this is the shortest query that
    // must reach the catalogue.
    it('looks up a two-character query', async () => {
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.autocomplete('OX');

      expect(getAutocompleteArticlesMock).toHaveBeenCalledWith('OX', AC_PREFIX);
    });

    it('runs a prefix article lookup with the trimmed input in the default part-number mode', async () => {
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.autocomplete('  wl-6340  ');

      expect(getAutocompleteArticlesMock).toHaveBeenCalledWith(
        'wl-6340',
        AC_PREFIX,
      );
      expect(getAutocompleteTermsMock).not.toHaveBeenCalled();
    });

    it('runs an exact article lookup in part_number_exact mode', async () => {
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.autocomplete('WL6340', SearchMode.PartNumberExact);

      expect(getAutocompleteArticlesMock).toHaveBeenCalledWith(
        'WL6340',
        AC_EXACT,
      );
    });

    it('runs a term lookup (getAutoCompleteSuggestions) in generic mode', async () => {
      getAutocompleteTermsMock.mockResolvedValueOnce([]);

      await service.autocomplete('oil filter', SearchMode.Generic);

      expect(getAutocompleteTermsMock).toHaveBeenCalledWith('oil filter');
      expect(getAutocompleteArticlesMock).not.toHaveBeenCalled();
    });
  });

  describe('autocomplete — caching', () => {
    it('uses a short hit TTL and a shorter empty-result TTL', async () => {
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.autocomplete('WL634');

      expect(cachedArrayMock).toHaveBeenCalledWith(
        'tecdoc:autocomplete:article:prefix:WL634',
        900,
        300,
        expect.any(Function),
      );
    });

    it('normalises equivalent part-number autocomplete cache keys', async () => {
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.autocomplete('wl634');
      await service.autocomplete('WL634');

      expect(cachedArrayMock.mock.calls[0][0]).toBe(
        cachedArrayMock.mock.calls[1][0],
      );
    });
  });

  describe('autocomplete — capping', () => {
    it('returns at most 5 article suggestions, keeping the catalogue order', async () => {
      const suggestions = Array.from({ length: 10 }, (_, i) =>
        suggestionItem(`WL63${i}`),
      );
      getAutocompleteArticlesMock.mockResolvedValueOnce(suggestions);

      const result = await service.autocomplete('WL63');

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual(suggestionItem('WL630'));
      expect(result[4]).toEqual(suggestionItem('WL634'));
    });

    it('returns at most 8 term suggestions in generic mode', async () => {
      getAutocompleteTermsMock.mockResolvedValueOnce(
        Array.from({ length: 12 }, (_, i) => ({
          kind: 'term' as const,
          term: `term ${i}`,
        })),
      );

      const result = await service.autocomplete(
        'oil filter',
        SearchMode.Generic,
      );

      expect(result).toHaveLength(8);
    });

    // The whole point of a per-kind cap: a three-character prefix matches far
    // more articles than the dropdown shows, and a shared budget would be spent
    // on numbers before reaching a single category row.
    it('keeps the category rows when the article rows are over their own cap', async () => {
      const articles = Array.from({ length: 10 }, (_, i) =>
        suggestionItem(`WL63${i}`),
      );
      const categories = Array.from({ length: 7 }, (_, i) =>
        categorySuggestionItem(`${i}`),
      );
      getAutocompleteArticlesMock.mockResolvedValueOnce([
        ...articles,
        ...categories,
      ]);

      const result = await service.autocomplete('WL63');

      expect(result.filter((item) => item.kind === 'article')).toHaveLength(5);
      expect(result.filter((item) => item.kind === 'category')).toHaveLength(5);
      expect(result[0].kind).toBe('article');
      expect(result[5].kind).toBe('category');
    });
  });

  describe('suggestForZeroResults — the "did you mean" recovery', () => {
    it('looks up the first 5 characters as an article prefix', async () => {
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.suggestForZeroResults('WL6340');

      expect(getAutocompleteArticlesMock).toHaveBeenCalledWith(
        'WL634',
        AC_PREFIX,
      );
    });

    it('does not look anything up when the query is under the minimum', async () => {
      const result = await service.suggestForZeroResults('W');

      expect(result).toEqual([]);
      expect(getAutocompleteArticlesMock).not.toHaveBeenCalled();
    });

    // The no-results page links each row to an article detail page, so a
    // category suggestion would have nowhere to land.
    it('keeps only the article rows', async () => {
      getAutocompleteArticlesMock.mockResolvedValueOnce([
        suggestionItem('WL630'),
        categorySuggestionItem('1'),
      ]);

      const result = await service.suggestForZeroResults('WL6340');

      expect(result).toEqual([suggestionItem('WL630')]);
    });

    // A page, not a dropdown: it is not held to the dropdown's article cap, so
    // every row the shared cache entry carries is offered.
    it('is not capped to the dropdown article limit', async () => {
      getAutocompleteArticlesMock.mockResolvedValueOnce(
        Array.from({ length: 8 }, (_, i) => suggestionItem(`WL63${i}`)),
      );

      const result = await service.suggestForZeroResults('WL6340');

      expect(result).toHaveLength(8);
    });

    // The recovery is always a prefix lookup, so it must not collide with the
    // exact-mode dropdown for the same input.
    it('caches under the prefix key regardless of the search mode', async () => {
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.suggestForZeroResults('WL634');

      expect(cachedArrayMock.mock.calls[0][0]).toBe(
        'tecdoc:autocomplete:article:prefix:WL634',
      );
    });
  });
});
