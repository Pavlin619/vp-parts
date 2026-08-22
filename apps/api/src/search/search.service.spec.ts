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
import { SearchCache } from './search-cache';
import { SearchLaneResolver } from './search-lane-resolver';
import { AutocompleteService } from './autocomplete.service';
import { hasActiveFilters, SearchFilters, SearchMode } from './search-types';
import { BrandsService } from '../catalog/brands';
import { RedisCache } from '../redis';

const searchArticlesMock = jest.fn();
const getAutocompleteArticlesMock = jest.fn();
const getAutocompleteTermsMock = jest.fn();
const getBrandsMock = jest.fn();
const applyLogosMock = jest.fn();
const cachedPaginatedMock = jest.fn();
const cachedArrayMock = jest.fn();
const readMemoMock = jest.fn();
const writeMemoMock = jest.fn();

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
// A consequence worth keeping in mind while reading the lane tests: the lane
// probe, which in production almost always answers from Redis, shows up here as
// a real searchArticles call.
const mockCache = {
  cachedPaginated: cachedPaginatedMock,
  cachedArray: cachedArrayMock,
  readMemo: readMemoMock,
  writeMemo: writeMemoMock,
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

// The article-autocomplete execution the zero-result recovery always uses,
// regardless of the search mode.
const AC_PREFIX = { type: 10, matchType: 'prefix' } as const;

function articleItem(
  articleNumber: string,
  overrides: Partial<ArticleSummaryDto> = {},
): ArticleSummaryDto {
  return {
    articleNumber,
    brandId: '268',
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
    maxPage: Math.ceil(items.length / 20),
    items,
    facets: [],
    attributes: [],
    categoryNavigation: { current: null, ancestors: [], options: [] },
    ...overrides,
  };
}

function suggestionItem(articleNumber: string): ArticleAutocompleteItemDto {
  return {
    kind: 'article',
    articleNumber,
    brandId: '268',
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
  { brandId: '268', brandName: 'WIX Filters', logoUrl: null },
  { brandId: '30', brandName: 'Bosch', logoUrl: null },
  { brandId: '72', brandName: 'MANN-FILTER', logoUrl: null },
];

// SearchService is exercised over its real collaborators (cache → lane resolver
// → autocomplete) rather than mocks of them: the seams between those four are
// pure plumbing, so mocking them would assert the plumbing instead of the
// behaviour. Only the edges — TecDoc, brands and Redis — are stubbed, which is
// what lets these tests assert the actual TecDoc calls a search produces. The
// units with logic of their own are covered directly in search-plan.spec.ts,
// search-cache-keys.spec.ts and autocomplete.service.spec.ts.
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
    cachedArrayMock.mockImplementation(
      (_key: string, _hit: number, _miss: number, loader: () => unknown) =>
        loader(),
    );
    applyLogosMock.mockImplementation((results: unknown) =>
      Promise.resolve(results),
    );
    // Default: a cold lane memo, so every search probes the plan in its natural
    // order.
    readMemoMock.mockResolvedValue(undefined);
    writeMemoMock.mockResolvedValue(undefined);
    // Default: no brand dictionary, so the query is searched as typed unless a
    // test opts into brand stripping by returning brands.
    getBrandsMock.mockResolvedValue([]);

    const searchCache = new SearchCache(
      mockSearchTecDoc,
      mockBrands,
      mockCache,
    );
    service = new SearchService(
      new SearchLaneResolver(searchCache),
      new AutocompleteService(searchCache),
      mockBrands,
    );
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

  // Only a part-number search whose brand token was stripped produces a
  // two-lane plan, so every test here searches "WIX WA5432" against the brand
  // dictionary: lane 1 is the bare number, lane 2 the raw query.
  describe('search — lane resolution', () => {
    const STRIPPED_LANE = 'WA5432';
    const RAW_LANE = 'WIX WA5432';
    const LANE_KEY = expect.stringMatching(/^tecdoc:search:lane:[a-f0-9]{64}$/);
    const LANE_TTL = 3600;

    beforeEach(() => {
      getBrandsMock.mockResolvedValue(BRANDS);
    });

    /**
     * Answers each lane independently, and separately for the unnarrowed probe
     * and the narrowed request. Stating both halves is the only way to tell a
     * correctly resolved lane from a crossed one: a crossing shows up as the
     * narrowed answer coming from a lane the unnarrowed probe never picked.
     */
    function respondPerLane(
      unnarrowed: Record<string, ArticleSummaryDto[]>,
      narrowed: Record<string, ArticleSummaryDto[]> = {},
    ): void {
      searchArticlesMock.mockImplementation(
        (
          query: string,
          _vehicleId: number | undefined,
          _execution: unknown,
          _page: number,
          _pageSize: number,
          filters: SearchFilters,
        ) =>
          Promise.resolve(
            pageOf(
              (hasActiveFilters(filters) ? narrowed : unnarrowed)[query] ?? [],
            ),
          ),
      );
    }

    function callsFor(query: string): unknown[][] {
      return (searchArticlesMock.mock.calls as unknown[][]).filter(
        (call) => call[0] === query,
      );
    }

    it('probes both lanes and answers from the first with matches', async () => {
      searchArticlesMock
        .mockResolvedValueOnce(pageOf([])) // WA5432 misses
        .mockResolvedValueOnce(pageOf([articleItem(RAW_LANE)]));

      const result = await service.search(RAW_LANE);

      expect(result.results).toEqual([articleItem(RAW_LANE)]);
      expect(writeMemoMock).toHaveBeenCalledWith(LANE_KEY, RAW_LANE, LANE_TTL);
    });

    // The probe fetches exactly the unnarrowed first page, so a request for
    // that page is already answered and must not pay for a second lookup.
    it('answers an unnarrowed first page from the probe itself', async () => {
      searchArticlesMock.mockResolvedValue(
        pageOf([articleItem(STRIPPED_LANE)]),
      );

      const result = await service.search(RAW_LANE);

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(result.results).toEqual([articleItem(STRIPPED_LANE)]);
      expect(writeMemoMock).toHaveBeenCalledWith(
        LANE_KEY,
        STRIPPED_LANE,
        LANE_TTL,
      );
    });

    it('pins the winning lane so the losing call is never repeated', async () => {
      readMemoMock.mockResolvedValue(RAW_LANE);
      respondPerLane({ [RAW_LANE]: [articleItem(RAW_LANE)] });

      await service.search(RAW_LANE);

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(callsFor(STRIPPED_LANE)).toHaveLength(0);
      expect(writeMemoMock).not.toHaveBeenCalled();
    });

    it('narrows only the lane the probe resolved', async () => {
      readMemoMock.mockResolvedValue(RAW_LANE);
      respondPerLane(
        { [RAW_LANE]: [articleItem(RAW_LANE)] },
        { [RAW_LANE]: [articleItem(RAW_LANE)] },
      );

      const filters = { brandIds: [4] };
      await service.search(RAW_LANE, undefined, 1, 20, filters);

      expect(callsFor(STRIPPED_LANE)).toHaveLength(0);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        RAW_LANE,
        undefined,
        PART,
        1,
        20,
        filters,
      );
    });

    // The lane must be a property of the query, not of whatever Redis happens
    // to hold: a narrowed request arriving on a cold memo — a shared link, a
    // fresh deploy, an eviction — has to resolve the same lane an unnarrowed
    // one would, or it answers from a lane the user never saw.
    it('resolves the lane from an unnarrowed probe when a narrowed request arrives cold', async () => {
      respondPerLane(
        { [RAW_LANE]: [articleItem(RAW_LANE)] },
        { [STRIPPED_LANE]: [articleItem('WRONG-LANE')] },
      );
      getAutocompleteArticlesMock.mockResolvedValue([]);

      const result = await service.search(RAW_LANE, undefined, 1, 20, {
        brandIds: [4],
      });

      expect(result.total).toBe(0);
      expect(result.results).toEqual([]);
      expect(callsFor(STRIPPED_LANE)).toEqual([
        [STRIPPED_LANE, undefined, PART, 1, 20, NO_FILTERS],
      ]);
    });

    it('keeps the caller page, page size and filters out of the probe', async () => {
      respondPerLane(
        { [STRIPPED_LANE]: [articleItem(STRIPPED_LANE)] },
        { [STRIPPED_LANE]: [articleItem(STRIPPED_LANE)] },
      );

      await service.search(RAW_LANE, undefined, 2, 50, {
        brandIds: [4],
        categoryNodeId: 100,
      });

      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        STRIPPED_LANE,
        undefined,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    // The user picked their facets from the resolved lane's result set, so a
    // combination that empties it must read as "no results" — not as articles
    // from a lane they never saw.
    it('reports no results instead of crossing lanes when a filter empties the resolved lane', async () => {
      readMemoMock.mockResolvedValue(STRIPPED_LANE);
      respondPerLane(
        { [STRIPPED_LANE]: [articleItem(STRIPPED_LANE)] },
        { [RAW_LANE]: [articleItem('WRONG-LANE')] },
      );
      getAutocompleteArticlesMock.mockResolvedValue([]);

      const result = await service.search(RAW_LANE, undefined, 1, 20, {
        brandIds: [4],
        categoryNodeId: 100,
      });

      expect(result.total).toBe(0);
      expect(result.results).toEqual([]);
      expect(callsFor(RAW_LANE)).toHaveLength(0);
    });

    // A memo outliving the matches it was written for must cost a slower probe,
    // never a wrong answer.
    it('falls back to the other lane when the memoised one has gone empty', async () => {
      readMemoMock.mockResolvedValue(STRIPPED_LANE);
      respondPerLane({ [RAW_LANE]: [articleItem(RAW_LANE)] });

      const result = await service.search(RAW_LANE);

      expect(result.results).toEqual([articleItem(RAW_LANE)]);
      expect(writeMemoMock).toHaveBeenCalledWith(LANE_KEY, RAW_LANE, LANE_TTL);
    });

    it('paginates the resolved lane without touching the other one', async () => {
      readMemoMock.mockResolvedValue(RAW_LANE);
      searchArticlesMock.mockImplementation(
        (
          query: string,
          _vehicleId: number | undefined,
          _execution: unknown,
          page: number,
        ) =>
          Promise.resolve(
            query === RAW_LANE
              ? pageOf([articleItem(RAW_LANE)], { total: 87, page })
              : pageOf([]),
          ),
      );

      await service.search(RAW_LANE, undefined, 3, 20);

      expect(callsFor(STRIPPED_LANE)).toHaveLength(0);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        RAW_LANE,
        undefined,
        PART,
        3,
        20,
        NO_FILTERS,
      );
    });

    it('uses one lane key across pages and filter combinations', async () => {
      searchArticlesMock.mockResolvedValue(
        pageOf([articleItem(STRIPPED_LANE)]),
      );

      await service.search(RAW_LANE, undefined, 1, 20, { brandIds: [4] });
      await service.search(RAW_LANE, undefined, 3, 50, {
        categoryNodeId: 100,
      });

      expect(readMemoMock.mock.calls[0][0]).toBe(readMemoMock.mock.calls[1][0]);
    });

    it('shares one lane key between equivalent query casings', async () => {
      searchArticlesMock.mockResolvedValue(
        pageOf([articleItem(STRIPPED_LANE)]),
      );

      await service.search(RAW_LANE);
      await service.search('wix wa5432');

      expect(readMemoMock.mock.calls[0][0]).toBe(readMemoMock.mock.calls[1][0]);
    });

    it('keys the lane per vehicle scope', async () => {
      searchArticlesMock.mockResolvedValue(
        pageOf([articleItem(STRIPPED_LANE)]),
      );

      await service.search(RAW_LANE);
      await service.search(RAW_LANE, 10042);

      expect(readMemoMock.mock.calls[0][0]).not.toBe(
        readMemoMock.mock.calls[1][0],
      );
    });

    it('probes the whole plan when the memo no longer matches it', async () => {
      readMemoMock.mockResolvedValue('AN-OLD-LANE');
      searchArticlesMock
        .mockResolvedValueOnce(pageOf([]))
        .mockResolvedValueOnce(pageOf([articleItem(RAW_LANE)]));

      await service.search(RAW_LANE);

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
    });

    // The probe is unnarrowed whatever the request carried, so the lane it
    // resolves is the query's own and is safe to pin for everyone else.
    it('memoises the query lane even when the request that resolved it was narrowed', async () => {
      respondPerLane({ [RAW_LANE]: [articleItem(RAW_LANE)] });
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search(RAW_LANE, undefined, 1, 20, { brandIds: [4] });

      expect(writeMemoMock).toHaveBeenCalledWith(LANE_KEY, RAW_LANE, LANE_TTL);
    });

    it('does not memoise when every lane misses', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search(RAW_LANE);

      expect(writeMemoMock).not.toHaveBeenCalled();
    });

    it('leaves the lane cache untouched for a single-lane plan', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WL6340')]));

      await service.search('WL634');

      expect(readMemoMock).not.toHaveBeenCalled();
      expect(writeMemoMock).not.toHaveBeenCalled();
    });

    it('leaves the lane cache untouched in generic mode', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('OF1')]));

      await service.search(
        'oil filter bosch',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      expect(readMemoMock).not.toHaveBeenCalled();
      expect(writeMemoMock).not.toHaveBeenCalled();
    });
  });

  describe('search — facets, attributes, category navigation and filters', () => {
    const facets: SearchFacetDto[] = [
      {
        id: 'brands',
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
        isMandatory: true,
        values: [{ value: '106.4', label: '106.4', count: 2 }],
      },
    ];

    const categoryNavigation: CategoryNavigationDto = {
      current: null,
      ancestors: [],
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
        brandIds: [4],
        categoryNodeId: 100,
        criteria: [{ criteriaId: 20, rawValue: '106.4' }],
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
        brandIds: [4],
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

    it('uses the shorter empty-page TTL', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([]));
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.search('NO-MATCH');

      expect(cachedPaginatedMock).toHaveBeenCalledWith(
        expect.stringMatching(/^tecdoc:search:[a-f0-9]{64}$/),
        3600,
        300,
        expect.any(Function),
      );
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

    it('uses one cache key for equivalent query and filter ordering', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([articleItem('WL6340')]));

      await service.search('wl634', undefined, 1, 20, {
        brandIds: [8, 4],
        criteria: [
          { criteriaId: 44, rawValue: 'front' },
          { criteriaId: 20, rawValue: '106.4' },
        ],
      });
      await service.search('WL634', undefined, 1, 20, {
        brandIds: [4, 8],
        criteria: [
          { criteriaId: 20, rawValue: '106.4' },
          { criteriaId: 44, rawValue: 'front' },
        ],
      });

      expect(cachedPaginatedMock.mock.calls[0][0]).toBe(
        cachedPaginatedMock.mock.calls[1][0],
      );
    });

    // The hint changes which facets TecDoc is asked for, so the two payloads are
    // not interchangeable and must not share a cache entry.
    it('keys a leaf and a non-leaf category search separately', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([articleItem('WL6340')]));

      await service.search('WL634', undefined, 1, 20, {
        categoryNodeId: 100,
        categoryHasChildren: false,
      });
      await service.search('WL634', undefined, 1, 20, {
        categoryNodeId: 100,
        categoryHasChildren: true,
      });

      expect(cachedPaginatedMock.mock.calls[0][0]).not.toBe(
        cachedPaginatedMock.mock.calls[1][0],
      );
    });

    // Both resolve to "do not request the criteria facets", so they produce
    // identical payloads and should share one entry rather than double-caching.
    it('shares one cache key between an absent hint and a non-leaf hint', async () => {
      searchArticlesMock.mockResolvedValue(pageOf([articleItem('WL6340')]));

      await service.search('WL634', undefined, 1, 20, {
        categoryNodeId: 100,
      });
      await service.search('WL634', undefined, 1, 20, {
        categoryNodeId: 100,
        categoryHasChildren: true,
      });

      expect(cachedPaginatedMock.mock.calls[0][0]).toBe(
        cachedPaginatedMock.mock.calls[1][0],
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

      const result = await service.search('WL634', 10042);

      expect(searchArticlesMock).toHaveBeenCalledTimes(1);
      expect(searchArticlesMock).toHaveBeenCalledWith(
        'WL634',
        10042,
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

      await service.search('WIX WA5432', 10042);

      expect(searchArticlesMock).toHaveBeenCalledTimes(2);
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        1,
        'WA5432',
        10042,
        PART,
        1,
        20,
        NO_FILTERS,
      );
      expect(searchArticlesMock).toHaveBeenNthCalledWith(
        2,
        'WIX WA5432',
        10042,
        PART,
        1,
        20,
        NO_FILTERS,
      );
    });

    it('returns a one-item list on a single match even when a vehicleId is provided', async () => {
      searchArticlesMock.mockResolvedValueOnce(pageOf([articleItem('WL6340')]));

      const result = await service.search('WL6340', 10042);

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

      await service.search('ZZZ999', 10042);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('search_zero_result'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('vehicleScoped=true'),
      );

      logSpy.mockRestore();
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
