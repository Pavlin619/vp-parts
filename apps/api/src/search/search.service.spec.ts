import { Logger } from '@nestjs/common';
import {
  ArticleSummaryDto,
  AutocompleteItemDto,
  BrandDto,
  PaginatedCatalogArticlesDto,
} from '@vp-parts-shop/shared';
import { SearchService } from './search.service';
import { CatalogService } from '../catalog/catalog.service';

const searchArticlesMock = jest.fn();
const getAutocompleteSuggestionsMock = jest.fn();
const getBrandsMock = jest.fn();

const mockCatalogService = {
  searchArticles: searchArticlesMock,
  getAutocompleteSuggestions: getAutocompleteSuggestionsMock,
  getBrands: getBrandsMock,
} as unknown as CatalogService;

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
  overrides: Partial<PaginatedCatalogArticlesDto> = {},
): PaginatedCatalogArticlesDto {
  return { total: items.length, page: 1, pageSize: 20, items, ...overrides };
}

function suggestionItem(articleNumber: string): AutocompleteItemDto {
  return { articleNumber, brandName: 'WIX', description: 'Oil Filter' };
}

const BRANDS: BrandDto[] = [
  { brandName: 'WIX Filters', logoUrl: null },
  { brandName: 'Bosch', logoUrl: null },
  { brandName: 'MANN-FILTER', logoUrl: null },
];

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService(mockCatalogService);
    jest.resetAllMocks();
    // Default: no brand dictionary, so the query is searched as typed unless a
    // test opts into brand stripping by returning brands.
    getBrandsMock.mockResolvedValue([]);
  });

  describe('search — fallback chain', () => {
    it('uses exact match as the first tier and returns immediately on a hit', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      await service.search('WL634');

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL634',
        undefined,
        'exact',
        1,
        20,
      );
    });

    it('falls through to prefix_or_suffix when exact returns zero results', async () => {
      searchArticlesMock
        .mockResolvedValueOnce(pageOf([]))
        .mockResolvedValueOnce(
          pageOf([articleItem('WL6340'), articleItem('WL6341')]),
        );

      const result = await service.search('WL634');

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        'WL634',
        undefined,
        'exact',
        1,
        20,
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        2,
        'WL634',
        undefined,
        'prefix_or_suffix',
        1,
        20,
      );
      expect(result.results).toHaveLength(2);
    });

    it('runs only the two number tiers when no brand token is stripped', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteSuggestionsMock.mockResolvedValue([]);

      await service.search('WL/6340');

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('search — brand prefix/suffix', () => {
    it('strips a trailing brand token and searches the bare number', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WA5432', { brandName: 'WIX Filters' })]),
      );

      const result = await service.search('WA5432 WIX');

      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WA5432',
        undefined,
        'exact',
        1,
        20,
      );
      expect(result).toEqual({ redirect: '/catalog/articles/WA5432' });
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
        'exact',
        1,
        20,
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
        'exact',
        1,
        20,
      );
    });

    it('falls back to the raw query when the brand-stripped query misses', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock
        .mockResolvedValueOnce(pageOf([])) // WA5432 exact
        .mockResolvedValueOnce(pageOf([])) // WA5432 prefix_or_suffix
        .mockResolvedValueOnce(pageOf([articleItem('WIX WA5432')])); // raw exact

      await service.search('WIX WA5432');

      expect(searchArticlesMock).toHaveBeenCalledTimes(3);
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        3,
        'WIX WA5432',
        undefined,
        'exact',
        1,
        20,
      );
    });

    it('returns the ranked list (no redirect) when several parts match a brand-qualified query', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([
          articleItem('WA5432', { brandName: 'Bosch' }),
          articleItem('WA5432', { brandName: 'WIX Filters' }),
        ]),
      );

      const result = await service.search('WA5432 WIX');

      expect(result.redirect).toBeUndefined();
      expect(result.results?.map((r) => r.brandName)).toEqual([
        'WIX Filters',
        'Bosch',
      ]);
    });

    it('ranks brand matches first without redirecting when several match', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([
          articleItem('B1', { brandName: 'Bosch' }),
          articleItem('W1', { brandName: 'WIX Filters' }),
          articleItem('W2', { brandName: 'WIX Filters' }),
        ]),
      );

      const result = await service.search('WA WIX');

      expect(result.redirect).toBeUndefined();
      expect(result.results?.map((r) => r.articleNumber)).toEqual([
        'W1',
        'W2',
        'B1',
      ]);
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

      const result = await service.search('WL', undefined, 2, 10);

      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL',
        undefined,
        'exact',
        2,
        10,
      );
      expect(result.total).toBe(87);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(result.results).toHaveLength(2);
    });

    it('does not redirect on a single total when the page is beyond the first', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('WL6340')], { total: 1, page: 3, pageSize: 20 }),
      );

      const result = await service.search('WL6340', undefined, 3, 20);

      expect(result.redirect).toBeUndefined();
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
        'exact',
        1,
        20,
      );
    });

    it('returns a redirect to the article detail page on a single exact match', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WL6340')]));

      const result = await service.search('WL6340');

      expect(result).toEqual({ redirect: '/catalog/articles/WL6340' });
    });

    it('returns a paginated result list when multiple articles match', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([
          articleItem('WL6340'),
          articleItem('WL6341', { description: 'Oil Filter Heavy Duty' }),
        ]),
      );

      const result = await service.search('WL634');

      expect(result.redirect).toBeUndefined();
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
      getAutocompleteSuggestionsMock.mockResolvedValueOnce([
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
        'exact',
        1,
        20,
      );
      expect(result.results?.map((r) => r.articleNumber)).toEqual([
        'WL6340',
        'WL6341',
      ]);
    });

    it('keeps the vehicle scope across the fallback tiers', async () => {
      searchArticlesMock
        .mockResolvedValueOnce(pageOf([]))
        .mockResolvedValueOnce(
          pageOf([articleItem('WL6340'), articleItem('WL6341')]),
        );

      await service.search('WL634', 'V10042');

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        'WL634',
        'V10042',
        'exact',
        1,
        20,
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        2,
        'WL634',
        'V10042',
        'prefix_or_suffix',
        1,
        20,
      );
    });

    it('redirects on a single match even when a vehicleId is provided', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WL6340')]));

      const result = await service.search('WL6340', 'V10042');

      expect(result).toEqual({ redirect: '/catalog/articles/WL6340' });
    });

    it('URL-encodes the article number in the redirect path', async () => {
      searchArticlesMock.mockResolvedValueOnce(
        pageOf([articleItem('BD 0986/451')]),
      );

      const result = await service.search('BD 0986/451');

      expect(result.redirect).toBe(
        `/catalog/articles/${encodeURIComponent('BD 0986/451')}`,
      );
    });
  });

  describe('search — zero-result suggestions', () => {
    it('fetches suggestions using the first 5 chars of the query', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteSuggestionsMock.mockResolvedValueOnce([]);

      await service.search('WL6340');

      expect(getAutocompleteSuggestionsMock).toHaveBeenCalledWith('WL634');
    });

    it('does not fetch suggestions when the query is shorter than 3 chars', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));

      await service.search('WL');

      expect(getAutocompleteSuggestionsMock).not.toHaveBeenCalled();
    });

    it('logs a structured zero-result entry recording the vehicle scope', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteSuggestionsMock.mockResolvedValue([]);
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
      expect(getAutocompleteSuggestionsMock).not.toHaveBeenCalled();
    });

    it('treats whitespace-padded short input as under 3 characters', async () => {
      const result = await service.autocomplete('  W6  ');

      expect(result).toEqual([]);
      expect(getAutocompleteSuggestionsMock).not.toHaveBeenCalled();
    });

    it('queries the catalogue with the trimmed input as typed', async () => {
      getAutocompleteSuggestionsMock.mockResolvedValueOnce([]);

      await service.autocomplete('  wl-6340  ');

      expect(getAutocompleteSuggestionsMock).toHaveBeenCalledWith('wl-6340');
    });

    it('returns at most 8 suggestions', async () => {
      const suggestions = Array.from({ length: 10 }, (_, i) => ({
        articleNumber: `WL63${i}`,
        brandName: 'WIX',
        description: 'Oil Filter',
      }));
      getAutocompleteSuggestionsMock.mockResolvedValueOnce(suggestions);

      const result = await service.autocomplete('WL63');

      expect(result).toHaveLength(8);
      expect(result[0].articleNumber).toBe('WL630');
    });
  });
});
