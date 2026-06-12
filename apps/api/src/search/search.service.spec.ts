import { ArticleListItemDto, AutocompleteItemDto } from '@vp-parts-shop/shared';
import { SearchService } from './search.service';
import { CatalogService } from '../catalog/catalog.service';
import { PartNumberNormaliser } from './normaliser';

const searchArticlesMock = jest.fn();
const getAutocompleteSuggestionsMock = jest.fn();

const mockCatalogService = {
  searchArticles: searchArticlesMock,
  getAutocompleteSuggestions: getAutocompleteSuggestionsMock,
} as unknown as CatalogService;

const normaliseMock = jest.fn();
const aggressiveNormaliseMock = jest.fn();

const mockNormaliser = {
  normalise: normaliseMock,
  aggressiveNormalise: aggressiveNormaliseMock,
} as unknown as PartNumberNormaliser;

function articleItem(
  articleNumber: string,
  overrides: Partial<ArticleListItemDto> = {},
): ArticleListItemDto {
  return {
    articleNumber,
    brandName: 'WIX',
    description: 'Oil Filter',
    thumbnailUrl: null,
    available: true,
    bestPriceExVat: 1250,
    bestPriceIncVat: 1500,
    ...overrides,
  };
}

function suggestionItem(articleNumber: string): AutocompleteItemDto {
  return { articleNumber, brandName: 'WIX', description: 'Oil Filter' };
}

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService(mockCatalogService, mockNormaliser);
    jest.resetAllMocks();
    normaliseMock.mockImplementation((input: string) =>
      input.trim().toUpperCase(),
    );
    aggressiveNormaliseMock.mockReturnValue(null);
  });

  describe('search — fallback chain', () => {
    it('uses exact match as the first tier and returns immediately on a hit', async () => {
      searchArticlesMock.mockResolvedValueOnce([articleItem('WL6340')]);

      await service.search('WL6340');

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        'exact',
      );
    });

    it('falls through to prefix_or_suffix when exact returns zero results', async () => {
      searchArticlesMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([articleItem('WL6340'), articleItem('WL6341')]);

      const result = await service.search('WL634');

      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        'WL634',
        undefined,
        'exact',
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        2,
        'WL634',
        undefined,
        'prefix_or_suffix',
      );
      expect(result.results).toHaveLength(2);
    });

    it('tries aggressive normalisation tiers when standard tiers both return zero', async () => {
      normaliseMock.mockReturnValue('WL6340');
      aggressiveNormaliseMock.mockReturnValue('WL6340AGG');
      searchArticlesMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([articleItem('WL6340')]);

      await service.search('WL/6340');

      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        'WL6340',
        undefined,
        'exact',
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        2,
        'WL6340',
        undefined,
        'prefix_or_suffix',
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        3,
        'WL6340AGG',
        undefined,
        'exact',
      );
    });

    it('reaches tier 4 (aggressive prefix_or_suffix) when tier 3 also returns zero', async () => {
      normaliseMock.mockReturnValue('WL6340');
      aggressiveNormaliseMock.mockReturnValue('WL6340AGG');
      searchArticlesMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([articleItem('WL6340'), articleItem('WL6341')]);

      const result = await service.search('WL/6340');

      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        4,
        'WL6340AGG',
        undefined,
        'prefix_or_suffix',
      );
      expect(result.results).toHaveLength(2);
    });

    it('skips aggressive tiers when aggressiveNormalise returns null', async () => {
      aggressiveNormaliseMock.mockReturnValue(null);
      searchArticlesMock.mockResolvedValue([]);
      getAutocompleteSuggestionsMock.mockResolvedValue([]);

      await service.search('WL6340');

      const calls = searchArticlesMock.mock.calls;
      expect(calls).toHaveLength(2);
    });

    it('skips aggressive tiers when aggressive query equals the standard query', async () => {
      normaliseMock.mockReturnValue('WL6340');
      aggressiveNormaliseMock.mockReturnValue('WL6340');
      searchArticlesMock.mockResolvedValue([]);
      getAutocompleteSuggestionsMock.mockResolvedValue([]);

      await service.search('wl6340');

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('search — existing behaviour', () => {
    it('normalises the raw query before searching the catalogue', async () => {
      normaliseMock.mockReturnValueOnce('WL6340');
      searchArticlesMock.mockResolvedValueOnce([articleItem('WL6340')]);

      await service.search('wl-6340 WIX');

      expect(normaliseMock).toHaveBeenCalledWith('wl-6340 WIX');
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        'exact',
      );
    });

    it('returns a redirect to the article detail page on a single exact match', async () => {
      searchArticlesMock.mockResolvedValueOnce([articleItem('WL6340')]);

      const result = await service.search('WL6340');

      expect(result).toEqual({ redirect: '/catalog/articles/WL6340' });
    });

    it('returns a result list when multiple articles match', async () => {
      searchArticlesMock.mockResolvedValueOnce([
        articleItem('WL6340'),
        articleItem('WL6341', { description: 'Oil Filter Heavy Duty' }),
      ]);

      const result = await service.search('WL634');

      expect(result.redirect).toBeUndefined();
      expect(result.query).toBe('WL634');
      expect(result.results).toEqual([
        {
          articleNumber: 'WL6340',
          brandName: 'WIX',
          description: 'Oil Filter',
          available: true,
          bestPriceIncVat: 1500,
          fitsVehicle: null,
        },
        {
          articleNumber: 'WL6341',
          brandName: 'WIX',
          description: 'Oil Filter Heavy Duty',
          available: true,
          bestPriceIncVat: 1500,
          fitsVehicle: null,
        },
      ]);
    });

    it('returns an empty result list and suggestions when nothing matches', async () => {
      searchArticlesMock.mockResolvedValue([]);
      getAutocompleteSuggestionsMock.mockResolvedValueOnce([
        suggestionItem('XXXX900'),
      ]);

      const result = await service.search('XXXX999');

      expect(result.results).toEqual([]);
      expect(result.suggestions).toEqual([suggestionItem('XXXX900')]);
    });

    it('omits suggestions when results are found', async () => {
      searchArticlesMock.mockResolvedValueOnce([articleItem('WL6340')]);

      const result = await service.search('WL6340');

      expect(result.suggestions).toBeUndefined();
    });

    it('annotates vehicle fit when a vehicleId is provided', async () => {
      searchArticlesMock
        .mockResolvedValueOnce([articleItem('WL6340'), articleItem('WL6341')])
        .mockResolvedValueOnce([articleItem('WL6340')]);

      const result = await service.search('WL634', 'V10042');

      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        'WL634',
        undefined,
        'exact',
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        2,
        'WL634',
        'V10042',
        'exact',
      );
      expect(result.results?.map((r) => r.fitsVehicle)).toEqual([true, false]);
    });

    it('redirects on a single match even when a vehicleId is provided', async () => {
      searchArticlesMock.mockResolvedValueOnce([articleItem('WL6340')]);

      const result = await service.search('WL6340', 'V10042');

      expect(result).toEqual({ redirect: '/catalog/articles/WL6340' });
    });

    it('URL-encodes the article number in the redirect path', async () => {
      searchArticlesMock.mockResolvedValueOnce([articleItem('BD 0986/451')]);

      const result = await service.search('BD0986451');

      expect(result.redirect).toBe(
        `/catalog/articles/${encodeURIComponent('BD 0986/451')}`,
      );
    });
  });

  describe('search — zero-result suggestions', () => {
    it('fetches autocomplete suggestions using the first 5 chars of the normalised query', async () => {
      normaliseMock.mockReturnValue('WL6340');
      searchArticlesMock.mockResolvedValue([]);
      getAutocompleteSuggestionsMock.mockResolvedValueOnce([]);

      await service.search('wl6340');

      expect(getAutocompleteSuggestionsMock).toHaveBeenCalledWith('WL634');
    });

    it('does not fetch suggestions when the normalised query is shorter than 3 chars', async () => {
      normaliseMock.mockReturnValue('WL');
      searchArticlesMock.mockResolvedValue([]);

      await service.search('WL');

      expect(getAutocompleteSuggestionsMock).not.toHaveBeenCalled();
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

    it('queries the catalogue with the normalised input so cache keys stay consistent', async () => {
      normaliseMock.mockReturnValueOnce('WL6340');
      getAutocompleteSuggestionsMock.mockResolvedValueOnce([]);

      await service.autocomplete('wl-6340');

      expect(normaliseMock).toHaveBeenCalledWith('wl-6340');
      expect(getAutocompleteSuggestionsMock).toHaveBeenCalledWith('WL6340');
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
