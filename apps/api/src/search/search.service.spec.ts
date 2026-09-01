import { Logger } from '@nestjs/common';
import {
  ArticleInventoryDetailDto,
  ArticleSummaryDto,
  ArticleAutocompleteItemDto,
  AttributeFacetDto,
  BrandDto,
  CategoryAutocompleteItemDto,
  CategoryNavigationDto,
  SearchFacetDto,
  articleIdentityKey,
} from '@vp-parts-shop/shared';
import { SearchService } from './search.service';
import { SearchTecDoc } from './search.tecdoc';
import { SearchCache } from './search-cache';
import { SearchResults } from './search-results';
import { SearchEnumeration } from './search-enumeration';
import { AutocompleteService } from './autocomplete.service';
import { SearchMode } from './search-types';
import { BrandsService } from '../catalog/brands';
import {
  ArticleOrderCache,
  ArticleRowsCache,
  HydratableArticle,
} from '../catalog/articles/article-list';
import { InventoryService } from '../inventory';
import { ArticleCandidate, ArticleStatus } from '../tecdoc';
import { RedisCache } from '../redis';

const enumerateMock = jest.fn();
const readRowsPageMock = jest.fn();
const getAutocompleteArticlesMock = jest.fn();
const getAutocompleteTermsMock = jest.fn();
const getBrandsMock = jest.fn();
const attachSearchLogosMock = jest.fn();
const hydrateMock = jest.fn();
const availabilityMock = jest.fn();
const cachedMock = jest.fn();
const cachedArrayMock = jest.fn();
const readMemoMock = jest.fn();
const writeMemoMock = jest.fn();

const mockSearchTecDoc = {
  enumerate: enumerateMock,
  readRowsPage: readRowsPageMock,
  getAutocompleteArticles: getAutocompleteArticlesMock,
  getAutocompleteTerms: getAutocompleteTermsMock,
} as unknown as SearchTecDoc;

const mockBrands = {
  getBrands: getBrandsMock,
  attachSearchLogos: attachSearchLogosMock,
} as unknown as BrandsService;

// The row cache and the stock read are units of their own with their own specs
// (article-rows.cache.spec.ts, article-ordering.spec.ts), so they are stubbed
// here alongside TecDoc and Redis.
const mockRows = { hydrate: hydrateMock } as unknown as ArticleRowsCache;

const mockInventory = {
  getAvailabilityForOrdering: availabilityMock,
} as unknown as InventoryService;

// The cache is transparent in unit tests: each helper simply runs its loader so
// the assertions below observe the real SearchTecDoc calls and their arguments.
const mockCache = {
  cached: cachedMock,
  cachedArray: cachedArrayMock,
  readMemo: readMemoMock,
  writeMemo: writeMemoMock,
} as unknown as RedisCache;

// search() defaults its filters param to an empty object, so every enumerate
// call carries this as its final argument unless a test supplies explicit facet
// selections.
const NO_FILTERS = {};

// The execution objects each SearchMode resolves to (see searchCallFor):
// part_number → prefix_or_suffix number search; part_number_exact → exact
// number match; generic → free-text (type 99).
const PART = { type: 10, matchType: 'prefix_or_suffix' } as const;
const EXACT = { type: 10, matchType: 'exact' } as const;
const TERM = { type: 99 } as const;

// The article-autocomplete execution the zero-result recovery always uses,
// regardless of the search mode.
const AC_PREFIX = { type: 10, matchType: 'prefix' } as const;

const EMPTY_NAVIGATION: CategoryNavigationDto = {
  current: null,
  ancestors: [],
  options: [],
};

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
    fitsVehicle: null,
    ...overrides,
  };
}

function articleItems(count: number): ArticleSummaryDto[] {
  return Array.from({ length: count }, (_unused, index) =>
    articleItem(`WL${6000 + index}`),
  );
}

/**
 * The rows TecDoc would answer for the articles a test put in its match set,
 * keyed the way hydration asks for them.
 *
 * Hydration is given an identity and nothing else — a stored ordering carries
 * nothing else — so a row's own fields have to come from the set the test
 * declared rather than from what `hydrate` was handed.
 */
const rowsByIdentity = new Map<string, ArticleSummaryDto>();

/**
 * The candidate TecDoc's whole-set read would answer with for a row — the
 * identity-only shape the ordering ranks and the row cache hydrates from.
 */
function candidateOf(item: ArticleSummaryDto): ArticleCandidate {
  rowsByIdentity.set(
    articleIdentityKey(item.brandId, item.articleNumber),
    item,
  );

  return {
    brandId: item.brandId,
    brandName: item.brandName,
    articleNumber: item.articleNumber,
    description: item.description,
    legacyArticleIds: [1],
    articleStatusId: ArticleStatus.Normal,
  };
}

function enumerationOf(
  items: ArticleSummaryDto[],
  overrides: Partial<SearchEnumeration> = {},
): SearchEnumeration {
  return {
    total: items.length,
    candidates: items.map(candidateOf),
    facets: [],
    attributes: [],
    categoryNavigation: EMPTY_NAVIGATION,
    ...overrides,
  };
}

/**
 * A match set too wide to rank, as the enumeration stores it: the total, the
 * facets and the navigation, with the candidates dropped.
 */
function wideEnumerationOf(
  total: number,
  overrides: Partial<SearchEnumeration> = {},
): SearchEnumeration {
  return {
    total,
    candidates: [],
    facets: [],
    attributes: [],
    categoryNavigation: EMPTY_NAVIGATION,
    ...overrides,
  };
}

function inStock(bestPriceIncVat: number): ArticleInventoryDetailDto {
  return {
    available: true,
    bestPriceExVat: Math.round(bestPriceIncVat / 1.2),
    bestPriceIncVat,
    availabilityByWarehouse: [
      {
        warehouseId: 'CENTRAL',
        quantity: 2,
        deliveryWorkDays: 0,
        orderCutoffTime: '17:00',
        cutoffAt: '2026-08-23T14:00:00.000Z',
        pickup: { earliestAt: '2026-08-23T15:00:00.000Z', granularity: 'HOUR' },
        courier: { earliestAt: '2026-08-24T06:00:00.000Z', granularity: 'DAY' },
      },
    ],
    computedAt: '2026-08-23T12:00:00.000Z',
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

// SearchService is exercised over its real collaborators (cache → results →
// autocomplete) rather than mocks of them: the seams between those are pure
// plumbing, so mocking them would assert the plumbing instead of the behaviour.
// Only the edges — TecDoc, brands, stock, the row cache and Redis — are
// stubbed, which is what lets these tests assert the actual TecDoc calls a
// search produces. The units with logic of their own are covered directly in
// search-call.spec.ts, search-cache-keys.spec.ts, search-enumeration.spec.ts,
// search-results.spec.ts and autocomplete.service.spec.ts.
describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    jest.resetAllMocks();
    // The cache helpers are transparent (run the loader) and the brand-logo join
    // is an identity passthrough, so tests observe the raw SearchTecDoc results
    // and calls.
    cachedMock.mockImplementation(
      (_key: string, _ttl: number, loader: () => unknown) => loader(),
    );
    cachedArrayMock.mockImplementation(
      (_key: string, _hit: number, _miss: number, loader: () => unknown) =>
        loader(),
    );
    attachSearchLogosMock.mockImplementation((join: unknown) =>
      Promise.resolve(join),
    );
    // Hydration answers each identity with the row the test's match set declared
    // for it, so a set built from articleItem() round-trips back to the same
    // rows.
    rowsByIdentity.clear();
    hydrateMock.mockImplementation((articles: HydratableArticle[]) =>
      Promise.resolve(
        articles.map(
          (article) =>
            rowsByIdentity.get(
              articleIdentityKey(article.brandId, article.articleNumber),
            ) ??
            articleItem(article.articleNumber, { brandId: article.brandId }),
        ),
      ),
    );
    // Default: no stock read, so the ordering degrades to catalogue data and the
    // fixtures come back in the order they were written.
    availabilityMock.mockResolvedValue(null);
    // Default: a cold order memo, so every search ranks its set afresh.
    readMemoMock.mockResolvedValue(undefined);
    writeMemoMock.mockResolvedValue(undefined);
    // Default: no brand dictionary, so the query is searched as typed unless a
    // test opts into brand stripping by returning brands.
    getBrandsMock.mockResolvedValue([]);

    const searchCache = new SearchCache(mockSearchTecDoc, mockCache);
    service = new SearchService(
      searchCache,
      new SearchResults(
        searchCache,
        new ArticleOrderCache(mockCache, mockInventory),
        mockRows,
      ),
      new AutocompleteService(searchCache),
      mockBrands,
    );
  });

  describe('search — part-number mode (default)', () => {
    it('answers the query with a single number call', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      await service.search('WL634');

      expect(enumerateMock).toHaveBeenCalledTimes(1);
      expect(enumerateMock).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        NO_FILTERS,
      );
    });

    // A descriptive query belongs in generic mode. Answering it here from
    // free-text would serve two visitors on the same mode from different
    // relations depending only on whether their query looked like a number.
    it('does not fall back to free-text when the number misses', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search('oil filter');

      const executions = enumerateMock.mock.calls.map((call) => call[2]);
      expect(executions).toEqual([PART]);
      expect(executions).not.toContainEqual(TERM);
    });
  });

  describe('search — exact mode (part_number_exact)', () => {
    it('issues a single exact number call over the raw query', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340')]),
      );

      await service.search(
        'WL6340',
        undefined,
        1,
        20,
        {},
        SearchMode.PartNumberExact,
      );

      expect(enumerateMock).toHaveBeenCalledTimes(1);
      expect(enumerateMock).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        EXACT,
        NO_FILTERS,
      );
    });

    it('does not strip the brand token in exact mode', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WA5432')]),
      );

      await service.search(
        'WA5432 WIX',
        undefined,
        1,
        20,
        {},
        SearchMode.PartNumberExact,
      );

      expect(enumerateMock).toHaveBeenCalledTimes(1);
      expect(enumerateMock).toHaveBeenCalledWith(
        'WA5432 WIX',
        undefined,
        EXACT,
        NO_FILTERS,
      );
    });

    it('never issues a free-text fallback in exact mode, even when it misses', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search(
        'oil filter',
        undefined,
        1,
        20,
        {},
        SearchMode.PartNumberExact,
      );

      const executions = enumerateMock.mock.calls.map((call) => call[2]);
      expect(executions).toEqual([EXACT]);
    });
  });

  describe('search — generic mode (free-text)', () => {
    it('issues a single free-text (type 99) call over the raw query', async () => {
      enumerateMock.mockResolvedValueOnce(enumerationOf([articleItem('OF1')]));

      await service.search(
        'oil filter',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      expect(enumerateMock).toHaveBeenCalledTimes(1);
      expect(enumerateMock).toHaveBeenCalledWith(
        'oil filter',
        undefined,
        TERM,
        NO_FILTERS,
      );
    });

    it('never runs a number search in generic mode', async () => {
      enumerateMock.mockResolvedValueOnce(enumerationOf([articleItem('OF1')]));

      await service.search(
        'oil filter',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      const executions = enumerateMock.mock.calls.map((call) => call[2]);
      expect(executions).toEqual([TERM]);
    });

    it('does not strip the brand token in generic mode', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValueOnce(enumerationOf([articleItem('OF1')]));

      await service.search(
        'oil filter bosch',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      expect(enumerateMock).toHaveBeenCalledTimes(1);
      expect(enumerateMock).toHaveBeenCalledWith(
        'oil filter bosch',
        undefined,
        TERM,
        NO_FILTERS,
      );
    });

    it('issues no fallback when the free-text call misses', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search(
        'zzz nothing here',
        undefined,
        1,
        20,
        {},
        SearchMode.Generic,
      );

      expect(enumerateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('search — brand stripping for number searches', () => {
    it('strips a trailing brand token and searches the bare number', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WA5432', { brandName: 'WIX Filters' })]),
      );

      const result = await service.search('WA5432 WIX');

      expect(enumerateMock).toHaveBeenCalledWith(
        'WA5432',
        undefined,
        PART,
        NO_FILTERS,
      );
      expect(result.results).toEqual([
        articleItem('WA5432', { brandName: 'WIX Filters' }),
      ]);
    });

    it('strips a leading brand token', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WA5432', { brandName: 'WIX Filters' })]),
      );

      await service.search('WIX WA5432');

      expect(enumerateMock).toHaveBeenCalledWith(
        'WA5432',
        undefined,
        PART,
        NO_FILTERS,
      );
    });

    it('never strips punctuation from inside the number', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL-6340/A', { brandName: 'WIX Filters' })]),
      );

      await service.search('WL-6340/A WIX');

      expect(enumerateMock).toHaveBeenCalledWith(
        'WL-6340/A',
        undefined,
        PART,
        NO_FILTERS,
      );
    });

    // The stripped token could have been part of the number, and a second call
    // over the raw query used to cover that. It never answered anything the
    // stripped call could not — `prefix_or_suffix` matches a number by its tail
    // — so a miss is now a miss.
    it('does not retry the raw query when the stripped one misses', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValue(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      const result = await service.search('WIX WA5432');

      expect(result.total).toBe(0);
      expect(enumerateMock).toHaveBeenCalledTimes(1);
      expect(enumerateMock).toHaveBeenCalledWith(
        'WA5432',
        undefined,
        PART,
        NO_FILTERS,
      );
    });

    it('does not fall back to free-text when the number misses', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValue(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValue([]);

      await service.search('WIX WA5432');

      const executions = enumerateMock.mock.calls.map((call) => call[2]);
      expect(executions).toEqual([PART]);
      expect(executions).not.toContainEqual(TERM);
    });
  });

  // The point of enumerating a set whole: a visitor searching for a part is
  // shown what we can actually ship first. Which rows outrank which is settled
  // in article-ordering.spec.ts — what matters here is that a search goes
  // through it and says so in the response.
  describe('search — ordering a set we can rank', () => {
    it('ranks what is in stock ahead of what is not', async () => {
      const wanted = articleItem('W-STOCKED');
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('A-NO-STOCK'), wanted]),
      );
      availabilityMock.mockResolvedValue(
        new Map([
          [
            articleIdentityKey(wanted.brandId, wanted.articleNumber),
            inStock(42),
          ],
        ]),
      );

      const result = await service.search('WL634');

      expect(result.results?.map((row) => row.articleNumber)).toEqual([
        'W-STOCKED',
        'A-NO-STOCK',
      ]);
      expect(result.ordering).toBe('availability');
    });

    it('reads stock for the whole enumerated set, not just the page', async () => {
      enumerateMock.mockResolvedValueOnce(enumerationOf(articleItems(30)));

      await service.search('WL634', undefined, 1, 20);

      expect(availabilityMock).toHaveBeenCalledWith(
        expect.arrayContaining([{ brandId: '268', articleNumber: 'WL6029' }]),
      );
      expect(availabilityMock.mock.calls[0][0]).toHaveLength(30);
    });

    // The hydrated row is roughly ten times a candidate, so only the page a
    // visitor reached is paid for.
    it('hydrates only the page it serves', async () => {
      enumerateMock.mockResolvedValueOnce(enumerationOf(articleItems(30)));

      await service.search('WL634', undefined, 1, 20);

      expect(hydrateMock.mock.calls[0][0]).toHaveLength(20);
    });

    // Two page turns ranked against two stock reads are not two pages of one
    // list: a part whose last unit sold in between drops a place, and the
    // visitor sees the row above it twice and the row below it never. So the
    // order the first page was cut from is what the second page is cut from too,
    // even once stock has moved under it.
    it('cuts the next page from the order the first one was served in', async () => {
      const memos = new Map<string, unknown>();
      readMemoMock.mockImplementation((key: string) =>
        Promise.resolve(memos.get(key)),
      );
      writeMemoMock.mockImplementation((key: string, value: unknown) => {
        memos.set(key, value);
        return Promise.resolve();
      });
      const set = [
        articleItem('FIRST'),
        articleItem('SECOND'),
        articleItem('THIRD'),
      ];
      enumerateMock.mockResolvedValue(enumerationOf(set));
      availabilityMock.mockResolvedValue(
        new Map([[articleIdentityKey('268', 'THIRD'), inStock(42)]]),
      );

      const first = await service.search('WL634', undefined, 1, 1);
      // The part that ranked first has since sold out, and another came in.
      availabilityMock.mockResolvedValue(
        new Map([[articleIdentityKey('268', 'SECOND'), inStock(42)]]),
      );
      const second = await service.search('WL634', undefined, 2, 1);

      expect(first.results?.map((row) => row.articleNumber)).toEqual(['THIRD']);
      expect(second.results?.map((row) => row.articleNumber)).toEqual([
        'FIRST',
      ]);
      expect(availabilityMock).toHaveBeenCalledTimes(1);
    });
  });

  // Ranking a truncated set would promise "in stock first" over an arbitrary
  // thousand of a million matches, so a set this wide is served in TecDoc's own
  // order from a page read instead.
  describe('search — a match set too wide to rank', () => {
    beforeEach(() => {
      enumerateMock.mockResolvedValue(wideEnumerationOf(5000));
      readRowsPageMock.mockResolvedValue({
        items: [articleItem('WL6340')],
        maxAllowedPage: 200,
      });
    });

    it('reads the requested page and labels it as the catalogue order', async () => {
      const result = await service.search('филтър', undefined, 3, 20);

      expect(readRowsPageMock).toHaveBeenCalledWith(
        'филтър',
        undefined,
        PART,
        3,
        20,
        NO_FILTERS,
      );
      expect(result.results).toEqual([articleItem('WL6340')]);
      expect(result.ordering).toBe('catalogue');
    });

    it('takes maxPage from TecDoc\u2019s own paging ceiling', async () => {
      const result = await service.search('филтър', undefined, 3, 20);

      expect(result.total).toBe(5000);
      expect(result.maxPage).toBe(200);
    });

    it('neither reads stock nor hydrates rows of its own', async () => {
      await service.search('филтър');

      expect(availabilityMock).not.toHaveBeenCalled();
      expect(hydrateMock).not.toHaveBeenCalled();
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

    it('surfaces the enumerated facets, attributes and category navigation', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340'), articleItem('WL6341')], {
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

    it('omits facets, attributes and category navigation when the set has none', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      const result = await service.search('WL634');

      expect(result).not.toHaveProperty('facets');
      expect(result).not.toHaveProperty('attributes');
      expect(result).not.toHaveProperty('categoryNavigation');
    });

    // The attribute block describes the whole match set, so page 2 would repeat
    // page 1's verbatim; the client keeps the one it was given while paging.
    it('omits the attributes once the visitor has paged past the first page', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf(articleItems(30), { facets, attributes }),
      );

      const result = await service.search('WL634', undefined, 2, 20);

      expect(result.facets).toEqual(facets);
      expect(result).not.toHaveProperty('attributes');
    });

    it('forwards the active brand/category/criteria selections to the catalog', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340'), articleItem('WL6341')], {
          facets,
        }),
      );

      const filters = {
        brandIds: [4],
        categoryNodeId: 100,
        criteria: [{ criteriaId: 20, rawValue: '106.4' }],
      };
      await service.search('WL634', undefined, 1, 20, filters);

      expect(enumerateMock).toHaveBeenCalledWith(
        'WL634',
        undefined,
        PART,
        filters,
      );
    });

    it('returns the single filtered result as a list', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340')], { facets }),
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
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340')]),
      );

      const result = await service.search('WL6340');

      expect(result.results).toEqual([articleItem('WL6340')]);
      expect(result.total).toBe(1);
      expect(result).not.toHaveProperty('redirect');
    });

    it('returns a one-item list for a single free-text hit in generic mode', async () => {
      enumerateMock.mockResolvedValueOnce(enumerationOf([articleItem('OF1')]));

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

    it('returns a one-item list when the single hit came from a stripped query', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WA5432', { brandName: 'WIX Filters' })]),
      );

      const result = await service.search('WIX WA5432');

      expect(result.results).toHaveLength(1);
    });
  });

  describe('search — pagination', () => {
    it('serves the requested slice of the ranked set and echoes the paging', async () => {
      enumerateMock.mockResolvedValueOnce(enumerationOf(articleItems(25)));

      const result = await service.search('WL634', undefined, 2, 10);

      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(result.maxPage).toBe(3);
      expect(result.results?.map((row) => row.articleNumber)).toEqual(
        articleItems(20)
          .slice(10)
          .map((row) => row.articleNumber),
      );
    });

    it('uses the shorter empty-set TTL', async () => {
      enumerateMock.mockResolvedValueOnce(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.search('NO-MATCH');

      expect(cachedMock).toHaveBeenCalledWith(
        expect.stringMatching(/^tecdoc:search:set:[a-f0-9]{64}$/),
        3600,
        expect.any(Function),
        { missTtl: 300, isEmpty: expect.any(Function) },
      );
    });
  });

  describe('search — query handling', () => {
    it('sends the query to TecDoc as typed, only trimming whitespace', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([
          articleItem('06J 115 403 Q'),
          articleItem('06J 115 403 C'),
        ]),
      );

      await service.search('  06J 115 403 Q  ');

      expect(enumerateMock).toHaveBeenCalledWith(
        '06J 115 403 Q',
        undefined,
        PART,
        NO_FILTERS,
      );
    });

    it('uses one cache key for equivalent query and filter ordering', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([articleItem('WL6340')]));

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

      expect(cachedMock.mock.calls[0][0]).toBe(cachedMock.mock.calls[1][0]);
    });

    // One enumeration answers every page of a search, so the page must not
    // reach the key at all.
    it('uses one cache key across the pages of one search', async () => {
      enumerateMock.mockResolvedValue(enumerationOf(articleItems(30)));

      await service.search('WL634', undefined, 1, 20);
      await service.search('WL634', undefined, 2, 20);

      expect(cachedMock.mock.calls[0][0]).toBe(cachedMock.mock.calls[1][0]);
    });

    // The hint changes which facets TecDoc is asked for, so the two payloads are
    // not interchangeable and must not share a cache entry.
    it('keys a leaf and a non-leaf category search separately', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([articleItem('WL6340')]));

      await service.search('WL634', undefined, 1, 20, {
        categoryNodeId: 100,
        categoryHasChildren: false,
      });
      await service.search('WL634', undefined, 1, 20, {
        categoryNodeId: 100,
        categoryHasChildren: true,
      });

      expect(cachedMock.mock.calls[0][0]).not.toBe(cachedMock.mock.calls[1][0]);
    });

    // Both resolve to "do not request the criteria facets", so they produce
    // identical payloads and should share one entry rather than double-caching.
    it('shares one cache key between an absent hint and a non-leaf hint', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([articleItem('WL6340')]));

      await service.search('WL634', undefined, 1, 20, {
        categoryNodeId: 100,
      });
      await service.search('WL634', undefined, 1, 20, {
        categoryNodeId: 100,
        categoryHasChildren: true,
      });

      expect(cachedMock.mock.calls[0][0]).toBe(cachedMock.mock.calls[1][0]);
    });

    it('returns a paginated result list when multiple articles match', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([
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
      enumerateMock.mockResolvedValue(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValueOnce([
        suggestionItem('XXXX900'),
      ]);

      const result = await service.search('XXXX999');

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.suggestions).toEqual([suggestionItem('XXXX900')]);
    });

    it('omits suggestions when results are found', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      const result = await service.search('WL634');

      expect(result.suggestions).toBeUndefined();
    });

    it('scopes the main search to the vehicle and does not run a second lookup', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      const result = await service.search('WL634', 10042);

      expect(enumerateMock).toHaveBeenCalledTimes(1);
      expect(enumerateMock).toHaveBeenCalledWith(
        'WL634',
        10042,
        PART,
        NO_FILTERS,
      );
      expect(result.results?.map((r) => r.articleNumber)).toEqual([
        'WL6340',
        'WL6341',
      ]);
    });

    it('keeps the vehicle scope on a brand-stripped query', async () => {
      getBrandsMock.mockResolvedValue(BRANDS);
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340'), articleItem('WL6341')]),
      );

      await service.search('WIX WA5432', 10042);

      expect(enumerateMock).toHaveBeenCalledTimes(1);
      expect(enumerateMock).toHaveBeenCalledWith(
        'WA5432',
        10042,
        PART,
        NO_FILTERS,
      );
    });

    it('returns a one-item list on a single match even when a vehicleId is provided', async () => {
      enumerateMock.mockResolvedValueOnce(
        enumerationOf([articleItem('WL6340')]),
      );

      const result = await service.search('WL6340', 10042);

      expect(result.results).toEqual([articleItem('WL6340')]);
      expect(result).not.toHaveProperty('redirect');
    });
  });

  describe('search — zero-result suggestions', () => {
    it('fetches suggestions using the first 5 chars of the query', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValueOnce([]);

      await service.search('WL6340');

      expect(getAutocompleteArticlesMock).toHaveBeenCalledWith(
        'WL634',
        AC_PREFIX,
      );
    });

    it('does not fetch suggestions when the query is shorter than 3 chars', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([]));

      await service.search('WL');

      expect(getAutocompleteArticlesMock).not.toHaveBeenCalled();
    });

    it('logs a structured zero-result entry recording the vehicle scope', async () => {
      enumerateMock.mockResolvedValue(enumerationOf([]));
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
      enumerateMock.mockResolvedValue(enumerationOf([]));
      getAutocompleteArticlesMock.mockResolvedValueOnce([
        suggestionItem('WL630'),
        categorySuggestionItem('1'),
      ]);

      const result = await service.search('WL6340');

      expect(result.suggestions).toEqual([suggestionItem('WL630')]);
    });
  });
});
