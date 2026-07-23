import { Logger } from '@nestjs/common';
import {
  ArticleSummaryDto,
  ArticleAutocompleteItemDto,
  AttributeFacetDto,
  BrandDto,
  CategoryAutocompleteItemDto,
  CategoryNavigationDto,
  PaginatedSearchArticlesDto,
  SearchFacetDto,
} from '@vp-parts-shop/shared';
import { SearchService } from './search.service';
import { SearchTecDoc } from './search.tecdoc';
import { SearchMode } from './search-types';
import { BrandsService } from '../catalog/brands';
import { RedisCache } from '../redis';

const searchArticlesMock = jest.fn();
const getAutocompleteArticlesMock = jest.fn();
const getAutocompleteTermsMock = jest.fn();
const getBrandsMock = jest.fn();
const applyLogosMock = jest.fn();
const cachedPaginatedMock = jest.fn();
const cachedMock = jest.fn();

const mockSearchTecDoc = {
  searchArticles: searchArticlesMock,
  getAutocompleteArticles: getAutocompleteArticlesMock,
  getAutocompleteTerms: getAutocompleteTermsMock,
} as unknown as SearchTecDoc;

const mockBrands = {
  getBrands: getBrandsMock,
  applyLogosToSearchResults: applyLogosMock,
} as unknown as BrandsService;

// The cache is transparent in unit tests: each helper simply runs its loader so
// the assertions below observe the real SearchTecDoc calls and their arguments.
const mockCache = {
  cachedPaginated: cachedPaginatedMock,
  cached: cachedMock,
} as unknown as RedisCache;

// search() defaults its filters param to an empty object, so every
// searchArticles call carries this as its final argument unless a test supplies
// explicit facet selections.
const NO_FILTERS = {};

// The execution objects each SearchMode resolves to (see buildSearchPlan):
// part_number → prefix_or_suffix number search; part_number_exact → exact
// number match; generic → free-text (type 99).
const PART = { type: 10, matchType: 'prefix_or_suffix' } as const;
const EXACT = { type: 10, matchType: 'exact' } as const;
const TERM = { type: 99 } as const;

// The article-autocomplete executions each mode resolves to (see
// SearchService.autocomplete): part_number → prefix, part_number_exact → exact.
const AC_PREFIX = { type: 10, matchType: 'prefix' } as const;
const AC_EXACT = { type: 10, matchType: 'exact' } as const;

function articleItem(
  articleNumber: string,
  overrides: Partial<ArticleSummaryDto> = {},
): ArticleSummaryDto {
  return {
    articleNumber,
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
    ...overrides,
  };
}

function pageOf(
  items: ArticleSummaryDto[],
  overrides: Partial<PaginatedSearchArticlesDto> = {},
): PaginatedSearchArticlesDto {
  return {
    total: items.length,
    page: 1,
    pageSize: 20,
    items,
    facets: [],
    attributes: [],
    categoryNavigation: { current: null, options: [] },
    ...overrides,
  };
}

function suggestionItem(articleNumber: string): ArticleAutocompleteItemDto {
  return {
    kind: 'article',
    articleNumber,
    brandName: 'WIX',
    description: 'Oil Filter',
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

const BRANDS: BrandDto[] = [
  { brandName: 'WIX Filters', logoUrl: null },
  { brandName: 'Bosch', logoUrl: null },
  { brandName: 'MANN-FILTER', logoUrl: null },
];

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    jest.resetAllMocks();
    // The cache helpers are transparent (run the loader) and the brand-logo join
    // is an identity passthrough, so tests observe the raw SearchTecDoc results
    // and calls.
    cachedPaginatedMock.mockImplementation(
      (_key: string, _hit: number, _miss: number, loader: () => unknown) =>
        loader(),
    );
    cachedMock.mockImplementation(
      (_key: string, _ttl: number, loader: () => unknown) => loader(),
    );
    applyLogosMock.mockImplementation((results: unknown) =>
      Promise.resolve(results),
    );
    // Default: no brand dictionary, so the query is searched as typed unless a
    // test opts into brand stripping by returning brands.
    getBrandsMock.mockResolvedValue([]);
    service = new SearchService(mockSearchTecDoc, mockBrands, mockCache);
  });

  describe('search — part-number mode (default)', () => {
    it('resolves a query that hits the number lane in a single call', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      await service.search('WL634');

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('does not fall back to free-text when the number lane misses', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search('oil filter');

      const executions = searchArticlesMock.mock.calls.map((call) => call[2]);
      expect(executions).toEqual([PART]);
      expect(executions).not.toContainEqual(TERM);
    });

    it('does not fall back to free-text once the number lane hits', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WL6340')]));

      await service.search('WL6340');

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      const executions = searchArticlesMock.mock.calls.map((call) => call[2]);
      expect(executions).not.toContainEqual(TERM);
    });
  });

  describe('search — exact mode (part_number_exact)', () => {
    it('issues a single exact number call over the raw query', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WL6340')]));

      await service.search(
        'WL6340',
        undefined,
        1,
        20,
        {},
        SearchMode.PartNumberExact,
      );

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        EXACT,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('does not strip the brand token in exact mode', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WA5432')]));

      await service.search(
        'WA5432 WIX',
        undefined,
        1,
        20,
        {},
        SearchMode.PartNumberExact,
      );

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WA5432 WIX',
        undefined,
        EXACT,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('never issues a free-text fallback in exact mode, even when it misses', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search(
        'oil filter',
        undefined,
        1,
        20,
        {},
        SearchMode.PartNumberExact,
      );

      const executions = searchArticlesMock.mock.calls.map((call) => call[2]);
      expect(executions).toEqual([EXACT]);
    });
  });

  describe('search — generic mode (free-text)', () => {
    it('issues a single free-text (type 99) call over the raw query', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('OF1')]));

      await service.search(
        'oil filter',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'oil filter',
        undefined,
        TERM,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('does not run the number lane in generic mode', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('OF1')]));

      await service.search(
        'oil filter',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      const executions = searchArticlesMock.mock.calls.map((call) => call[2]);
      expect(executions).toEqual([TERM]);
    });

    it('does not strip the brand token in generic mode', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('OF1')]));

      await service.search(
        'oil filter bosch',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'oil filter bosch',
        undefined,
        TERM,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('issues no fallback when the free-text call misses', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search(
        'zzz nothing here',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('search — brand stripping for number searches', () => {
    it('strips a trailing brand token and searches the bare number', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WA5432', { brandName: 'WIX Filters' })]),
      );

      const result = await service.search('WA5432 WIX');

      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WA5432',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
      expect(result.results).toEqual([
        articleItem('WA5432', { brandName: 'WIX Filters' }),
      ]);
    });

    it('strips a leading brand token', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WA5432', { brandName: 'WIX Filters' })]),
      );

      await service.search('WIX WA5432');

      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WA5432',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('never strips punctuation from inside the number', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL-6340/A', { brandName: 'WIX Filters' })]),
      );

      await service.search('WL-6340/A WIX');

      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL-6340/A',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('falls back to the raw query when the brand-stripped query misses', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock
        .mockResolvedValueOnce(pageOf([])) // WA5432 prefix_or_suffix
        .mockResolvedValueOnce(pageOf([articleItem('WIX WA5432')])); // raw prefix_or_suffix

      await service.search('WIX WA5432');

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        'WA5432',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        2,
        'WIX WA5432',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('runs both number candidates and does not fall back to free-text when everything misses', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search('WIX WA5432');

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
      const executions = searchArticlesMock.mock.calls.map((call) => call[2]);
      expect(executions).toEqual([PART, PART]);
      expect(executions).not.toContainEqual(TERM);
    });

    it('preserves TecDoc native order (no ranking)', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([
          articleItem('B1', { brandName: 'Bosch' }),
          articleItem('W1', { brandName: 'WIX Filters' }),
          articleItem('W2', { brandName: 'WIX Filters' }),
        ]),
      );

      const result = await service.search('WA5432');

      expect(result.results?.map((r) => r.articleNumber)).toEqual([
        'B1',
        'W1',
        'W2',
      ]);
    });
  });

  describe('search — facets, attributes, category navigation and filters', () => {
    const facets: SearchFacetDto[] = [
      {
        id: 'brands',
        label: 'Производител',
        values: [{ id: '4', label: 'WIX', count: 2, imageUrl: null }],
      },
    ];

    const attributes: AttributeFacetDto[] = [
      {
        id: '20',
        label: 'Ширина',
        unit: 'мм',
        type: 'N',
        isInterval: false,
        values: [{ value: '106.4', label: '106.4', count: 2 }],
      },
    ];

    const categoryNavigation: CategoryNavigationDto = {
      current: null,
      options: [
        {
          id: '100',
          label: 'Спирачна система',
          count: 2,
          hasChildren: true,
        },
      ],
    };

    it('surfaces the winning tier facets, attributes and category navigation', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340'), articleItem('WL6341')], {
          facets,
          attributes,
          categoryNavigation,
        }),
      );

      const result = await service.search('WL634');

      expect(result.facets).toEqual(facets);
      expect(result.attributes).toEqual(attributes);
      expect(result.categoryNavigation).toEqual(categoryNavigation);
    });

    it('omits facets, attributes and category navigation when the winning tier has none', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      const result = await service.search('WL634');

      expect(result).not.toHaveProperty('facets');
      expect(result).not.toHaveProperty('attributes');
      expect(result).not.toHaveProperty('categoryNavigation');
    });

    it('forwards the active brand/category/criteria selections to the catalog', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340'), articleItem('WL6341')], { facets }),
      );

      const filters = {
        brandIds: ['4'],
        categoryNodeId: '100',
        criteria: [{ criteriaId: '20', rawValue: '106.4' }],
      };
      await service.search('WL634', undefined, 1, 20, filters);

      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        1,
        20,
        filters,
      );
    });

    it('returns the single filtered result as a list', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340')], { facets }),
      );

      const result = await service.search('WL6340', undefined, 1, 20, {
        brandIds: ['4'],
      });

      expect(result.results).toHaveLength(1);
      expect(result.facets).toEqual(facets);
    });
  });

  describe('search — single result stays on the list', () => {
    it('returns a one-item list for a single match on the typed query', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WL6340')]));

      const result = await service.search('WL6340');

      expect(result.results).toEqual([articleItem('WL6340')]);
      expect(result.total).toBe(1);
      expect(result).not.toHaveProperty('redirect');
    });

    it('returns a one-item list for a single free-text hit in generic mode', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('OF1')]));

      const result = await service.search(
        'oil filter mann',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      expect(result.results).toHaveLength(1);
    });

    it('returns a one-item list when the single hit comes from the raw-query fallback', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock
        .mockResolvedValueOnce(pageOf([])) // WA5432 prefix_or_suffix
        .mockResolvedValueOnce(pageOf([articleItem('WIX WA5432')])); // raw prefix_or_suffix

      const result = await service.search('WIX WA5432');

      expect(result.results).toHaveLength(1);
    });
  });

  describe('search — pagination', () => {
    it('passes page and pageSize through and echoes them in the response', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340'), articleItem('WL6341')], {
          total: 87,
          page: 2,
          pageSize: 10,
        }),
      );

      const result = await service.search('WL634', undefined, 2, 10);

      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        2,
        10,
        NO_FILTERS,
      );
      expect(result.total).toBe(87);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(result.results).toHaveLength(2);
    });
  });

  describe('search — query handling', () => {
    it('sends the query to TecDoc as typed, only trimming whitespace', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('06J 115 403 Q'), articleItem('06J 115 403 C')]),
      );

      await service.search('  06J 115 403 Q  ');

      expect(searchArticlesMock).toHaveBeenCalledWith(
        '06J 115 403 Q',
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('returns a paginated result list when multiple articles match', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([
          articleItem('WL6340'),
          articleItem('WL6341', { description: 'Oil Filter Heavy Duty' }),
        ]),
      );

      const result = await service.search('WL634');

      expect(result.query).toBe('WL634');
      expect(result).not.toHaveProperty('normalisedQuery');
      expect(result.total).toBe(2);
      expect(result.results).toEqual([
        articleItem('WL6340'),
        articleItem('WL6341', { description: 'Oil Filter Heavy Duty' }),
      ]);
    });

    it('returns an empty result list and suggestions when nothing matches', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValueOnce([
        suggestionItem('XXXX900'),
      ]);

      const result = await service.search('XXXX999');

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.suggestions).toEqual([suggestionItem('XXXX900')]);
    });

    it('omits suggestions when results are found', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      const result = await service.search('WL634');

      expect(result.suggestions).toBeUndefined();
    });

    it('scopes the main search to the vehicle and does not run a second lookup', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      const result = await service.search('WL634', 'V10042');

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL634',
        'V10042',
        PART,
        1,
        20,
        NO_FILTERS,
      );
      expect(result.results?.map((r) => r.articleNumber)).toEqual([
        'WL6340',
        'WL6341',
      ]);
    });

    it('keeps the vehicle scope across the raw-query fallback', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock
        .mockResolvedValueOnce(pageOf([])) // WA5432 prefix_or_suffix
        .mockResolvedValueOnce(
          pageOf([articleItem('WL6340'), articleItem('WL6341')]),
        ); // raw prefix_or_suffix

      await service.search('WIX WA5432', 'V10042');

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        'WA5432',
        'V10042',
        PART,
        1,
        20,
        NO_FILTERS,
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        2,
        'WIX WA5432',
        'V10042',
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('returns a one-item list on a single match even when a vehicleId is provided', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WL6340')]));

      const result = await service.search('WL6340', 'V10042');

      expect(result.results).toEqual([articleItem('WL6340')]);
      expect(result).not.toHaveProperty('redirect');
    });
  });

  describe('search — zero-result suggestions', () => {
    it('fetches suggestions using the first 5 chars of the query', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.search('WL6340');

      expect(getAutocompleteArticlesMock).toHaveBeenCalledWith(
        'WL634',
        AC_PREFIX,
      );
    });

    it('does not fetch suggestions when the query is shorter than 3 chars', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));

      await service.search('WL');

      expect(getAutocompleteArticlesMock).not.toHaveBeenCalled();
    });

    it('logs a structured zero-result entry recording the vehicle scope', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await service.search('ZZZ999', 'V10042');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('search_zero_result'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('vehicleScoped=true'),
      );

      logSpy.mockRestore();
    });
  });

  describe('autocomplete', () => {
    it('returns an empty list without calling the catalogue for input under 3 characters', async () => {
      const result = await service.autocomplete('WL');

      expect(result).toEqual([]);
      expect(getAutocompleteArticlesMock).not.toHaveBeenCalled();
      expect(getAutocompleteTermsMock).not.toHaveBeenCalled();
    });

    it('treats whitespace-padded short input as under 3 characters', async () => {
      const result = await service.autocomplete('  W6  ');

      expect(result).toEqual([]);
      expect(getAutocompleteArticlesMock).not.toHaveBeenCalled();
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

    it('returns at most 8 suggestions', async () => {
      const suggestions = Array.from({ length: 10 }, (_, i) =>
        suggestionItem(`WL63${i}`),
      );
      getAutocompleteArticlesMock.mockResolvedValueOnce(suggestions);

      const result = await service.autocomplete('WL63');

      expect(result).toHaveLength(8);
      expect(result[0]).toEqual(suggestionItem('WL630'));
    });

    it('caps articles and category suggestions independently, articles first', async () => {
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

      expect(result.filter((item) => item.kind === 'article')).toHaveLength(8);
      expect(result.filter((item) => item.kind === 'category')).toHaveLength(5);
      expect(result[0].kind).toBe('article');
      expect(result[8].kind).toBe('category');
    });

    it('keeps only article suggestions on the zero-result recovery path', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValueOnce([
        suggestionItem('WL630'),
        categorySuggestionItem('1'),
      ]);

      const result = await service.search('WL6340');

      expect(result.suggestions).toEqual([suggestionItem('WL630')]);
    });
  });
});
