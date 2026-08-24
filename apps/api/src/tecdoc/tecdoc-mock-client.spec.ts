import {
  ArticleAutocompleteItemDto,
  LinkedVehicleManufacturerDto,
} from '@vp-parts-shop/shared';
import { TecDocMockClient } from './tecdoc-mock-client';
import type { CrossReferenceCandidate } from './cross-reference-mapper';
import { TecDocSearchType } from '../search/search-types';

// The fixture's own node ids. They are written out in the mock rather than
// minted, so a test may name them directly — see the drill's stability test.
const FILTERS_ROOT = 100;
const OIL_FILTER_LEAF = 100100;
const BRAKE_PAD_LEAF = 200200;
const OIL_FILTER_TYPE = 7;
const OIL_FILTER_HOUSING = 9;

// Two suppliers of the same fixture number — the collision pair.
const BOSCH = 30;
const MANN = 72;
const KNECHT = 94;
const MOCK_BRAND = 99001;

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
      // Selecting a category is not enough on its own: dimensions are opt-in, so
      // the client must also declare the node a leaf.
      const unhinted = await mock.searchArticles(
        'Brake Pad',
        undefined,
        { type: TecDocSearchType.FreeText },
        1,
        50,
        { categoryNodeId: BRAKE_PAD_LEAF },
      );

      const leaf = await mock.searchArticles(
        'Brake Pad',
        undefined,
        { type: TecDocSearchType.FreeText },
        1,
        50,
        { categoryNodeId: BRAKE_PAD_LEAF, categoryHasChildren: false },
      );

      expect(scoped.attributes).toEqual([]);
      expect(unhinted.attributes).toEqual([]);
      expect(leaf.attributes.length).toBeGreaterThan(0);
    });

    // Facet ids must be TecDoc-shaped numbers, not labels: the API validates them
    // at its boundary, so a mock that minted labels would round-trip here and be
    // rejected in front of the real service.
    it('identifies facets by numeric ids that round-trip as filters', async () => {
      const unfiltered = await mock.searchArticles('Brake Pad', undefined, {
        type: TecDocSearchType.FreeText,
      });
      const brandFacet = unfiltered.facets.find(
        (facet) => facet.id === 'brands',
      );
      const brand = brandFacet?.values[0];

      expect(brand).toBeDefined();
      expect(brand!.id).toMatch(/^[1-9][0-9]*$/);

      const filtered = await mock.searchArticles(
        'Brake Pad',
        undefined,
        { type: TecDocSearchType.FreeText },
        1,
        50,
        { brandIds: [Number(brand!.id)] },
      );

      expect(filtered.total).toBeGreaterThan(0);
      expect(
        filtered.items.every((item) => item.brandName === brand!.label),
      ).toBe(true);
    });
  });

  describe('category drill', () => {
    /** Every match under the oil-filter leaf, whatever its generic article. */
    const OIL_FILTER_QUERY = 'OF-';

    function drill(filters: {
      categoryNodeId?: number;
      categoryHasChildren?: boolean;
      productTypeIds?: number[];
    }) {
      return mock.searchArticles(
        OIL_FILTER_QUERY,
        undefined,
        { type: TecDocSearchType.AnyNumber },
        1,
        50,
        filters,
      );
    }

    it('opens on the root groups, each counting its whole subtree', async () => {
      const { categoryNavigation, total } = await drill({});

      expect(categoryNavigation.current).toBeNull();
      expect(categoryNavigation.options).toEqual([
        { id: '100', label: 'Филтри', count: total, hasChildren: true },
      ]);
    });

    it('offers the children of the selected branch', async () => {
      const { categoryNavigation } = await drill({
        categoryNodeId: FILTERS_ROOT,
        categoryHasChildren: true,
      });

      expect(categoryNavigation.current?.label).toBe('Филтри');
      expect(categoryNavigation.options.map((option) => option.label)).toEqual([
        'Маслен филтър / корпус / уплътнител',
      ]);
    });

    it('names the ancestors of the selected node, outermost first', async () => {
      const { categoryNavigation } = await drill({
        categoryNodeId: OIL_FILTER_LEAF,
        categoryHasChildren: false,
      });

      expect(
        categoryNavigation.ancestors.map((ancestor) => ancestor.label),
      ).toEqual(['Филтри']);
    });

    it('leaves the ancestors empty at a root', async () => {
      const { categoryNavigation } = await drill({
        categoryNodeId: FILTERS_ROOT,
        categoryHasChildren: true,
      });

      expect(categoryNavigation.ancestors).toEqual([]);
    });

    // Selecting a branch must not empty the results: the articles hang off its
    // leaves, never off the branch itself.
    it('keeps the whole subtree when a branch is selected', async () => {
      const [broad, branch] = await Promise.all([
        drill({}),
        drill({ categoryNodeId: FILTERS_ROOT, categoryHasChildren: true }),
      ]);

      expect(branch.total).toBe(broad.total);
      expect(branch.total).toBeGreaterThan(0);
    });

    // The case the generic-article level exists for, and the one InterCars
    // shows: one leaf assembly group holding four different kinds of part.
    it('hands the leaf over to its generic articles', async () => {
      const { categoryNavigation, facets } = await drill({
        categoryNodeId: OIL_FILTER_LEAF,
        categoryHasChildren: false,
      });
      const productTypes = facets.find((facet) => facet.id === 'productTypes');

      expect(categoryNavigation.current?.hasChildren).toBe(false);
      expect(categoryNavigation.options).toEqual([]);
      expect(productTypes?.values.map((value) => value.label)).toEqual([
        'Маслен филтър',
        'Корпус, маслен филтър',
        'Капак, кутия на масления филтър',
        'Комплект за преоборудване, резервен филтър',
      ]);
    });

    it('narrows the results and the dimensions to one generic article', async () => {
      const leaf = await drill({
        categoryNodeId: OIL_FILTER_LEAF,
        categoryHasChildren: false,
      });
      const housings = await drill({
        categoryNodeId: OIL_FILTER_LEAF,
        categoryHasChildren: false,
        productTypeIds: [OIL_FILTER_HOUSING],
      });

      expect(housings.total).toBeLessThan(leaf.total);
      expect(
        housings.items.every((item) => item.description.includes('Housing')),
      ).toBe(true);
      // A leaf's criteria are the union of four unrelated parts'; one generic
      // article's are coherent, which is the whole reason for the level.
      expect(housings.attributes.length).toBeLessThan(leaf.attributes.length);
    });

    // The ids reach the browser inside a URL and are cached in Redis beyond the
    // life of the process that served them. Minting them per run made a link
    // resolve to a different node — or to none, emptying a result set whose
    // facet count still promised matches. Asserting the literals is what stops
    // a lazily-numbered registry coming back.
    it('identifies categories and generic articles by written-out ids', async () => {
      const { categoryNavigation, facets } = await drill({
        categoryNodeId: OIL_FILTER_LEAF,
        categoryHasChildren: false,
      });
      const productTypes = facets.find((facet) => facet.id === 'productTypes');

      expect(categoryNavigation.current?.id).toBe('100100');
      expect(productTypes?.values.map((value) => value.id)).toEqual([
        '7',
        '9',
        '11',
        '13',
      ]);
    });
  });

  // The sidebar sorts, collapses and offers a search box only past ten brands,
  // and opens only the first three criteria. A fixture below either threshold
  // leaves the state nearly every visitor sees unreachable in dev.
  describe('sidebar breadth at the oil-filter leaf', () => {
    function atLeaf() {
      return mock.searchArticles(
        'filter',
        undefined,
        { type: TecDocSearchType.FreeText },
        1,
        50,
        { categoryNodeId: OIL_FILTER_LEAF, categoryHasChildren: false },
      );
    }

    it('returns enough brands for the list to collapse', async () => {
      const { facets } = await atLeaf();
      const brands = facets.find((facet) => facet.id === 'brands');

      expect(brands?.values.length).toBeGreaterThan(10);
    });

    it('returns enough criteria for most to stay closed', async () => {
      const { attributes } = await atLeaf();

      expect(attributes.length).toBeGreaterThan(3);
    });

    // Without a mandatory criterion holding more than one value, nothing would
    // open on arrival and the ranking would go untested in dev.
    it('offers mandatory criteria that can actually narrow', async () => {
      const { attributes } = await atLeaf();
      const leading = attributes.filter(
        (facet) => facet.isMandatory && facet.values.length > 1,
      );

      expect(leading.length).toBeGreaterThanOrEqual(3);
    });
  });

  // Every match set in the fixture used to fit on a single page at the default
  // size, so both pagers hid themselves on every query and neither could be
  // seen in dev at all, whatever you searched for.
  describe('breadth for pagination', () => {
    const DEFAULT_PAGE_SIZE = 20;

    function airFilters(page = 1) {
      return mock.searchArticles(
        'въздушен филтър',
        undefined,
        { type: TecDocSearchType.FreeText },
        page,
        DEFAULT_PAGE_SIZE,
      );
    }

    // Three pages is the smallest fixture that reaches a middle page, where
    // "previous" and "next" are both live.
    it('matches enough articles to reach a middle page', async () => {
      const { total, maxPage } = await airFilters();

      expect(total).toBeGreaterThan(2 * DEFAULT_PAGE_SIZE);
      expect(maxPage).toBeGreaterThanOrEqual(3);
    });

    it('fills the first page and still answers the last', async () => {
      const [first, last] = await Promise.all([airFilters(1), airFilters(3)]);

      expect(first.items).toHaveLength(DEFAULT_PAGE_SIZE);
      expect(last.items.length).toBeGreaterThan(0);
    });

    it('serves a different slice on each page', async () => {
      const [first, second] = await Promise.all([airFilters(1), airFilters(2)]);
      const firstNumbers = first.items.map((item) => item.articleNumber);
      const secondNumbers = second.items.map((item) => item.articleNumber);

      expect(
        firstNumbers.filter((number) => secondNumbers.includes(number)),
      ).toEqual([]);
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
      // Without the brand a suggestion cannot be turned into a link.
      expect(articles[0].brandId).toEqual(expect.any(String));
    });

    // Two suppliers filing one number are two suggestions, not a duplicate —
    // the customer picks the brand they want from the dropdown.
    it('suggests each brand of a shared article number', async () => {
      const exact = await mock.getAutocompleteArticles('OX 982D', {
        type: TecDocSearchType.AnyNumber,
        matchType: 'exact',
      });
      const brands = articlesOf(exact).map((item) => item.brandName);

      expect(new Set(brands).size).toBe(brands.length);
      expect(brands.length).toBeGreaterThan(1);
    });

    it('keeps only exact number matches for an exact execution', async () => {
      const exact = await mock.getAutocompleteArticles('OX 982D', {
        type: TecDocSearchType.AnyNumber,
        matchType: 'exact',
      });
      const numbers = articlesOf(exact).map((item) => item.articleNumber);

      expect(numbers.every((number) => number === 'OX 982D')).toBe(true);
      expect(numbers.length).toBeGreaterThan(0);

      // A partial number matches nothing under the exact strategy.
      const partial = await mock.getAutocompleteArticles('OX 98', {
        type: TecDocSearchType.AnyNumber,
        matchType: 'exact',
      });
      expect(partial).toEqual([]);
    });

    // Ferodo files both a disc and a pad under "DF", so the one query lands in
    // two leaves — the only shape that earns a category suggestion.
    it('appends category suggestions when the matches span multiple categories', async () => {
      const result = await mock.getAutocompleteArticles('DF');

      const categories = result.filter((item) => item.kind === 'category');
      expect(categories.length).toBeGreaterThan(1);
      expect(categories.length).toBeLessThanOrEqual(5);
      expect(categories[0]).toMatchObject({ kind: 'category', term: 'DF' });
      expect(categories[0]).toHaveProperty('categoryNodeId');
    });

    it('omits them when every match falls in one category', async () => {
      const result = await mock.getAutocompleteArticles('OF-');

      expect(result.every((item) => item.kind === 'article')).toBe(true);
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

  describe('linked vehicles', () => {
    /**
     * Walks an article to its makes exactly as ArticlesService does, so every
     * assertion below also proves the chain between article number, legacy id
     * and make holds together.
     */
    async function makesOf(
      brandId: number,
      articleNumber: string,
    ): Promise<LinkedVehicleManufacturerDto[]> {
      const [legacyArticleId] = await mock.getLegacyArticleIds(
        brandId,
        articleNumber,
      );

      return legacyArticleId === undefined
        ? []
        : mock.getLinkedManufacturers(legacyArticleId);
    }

    async function vehiclesOf(
      brandId: number,
      articleNumber: string,
      manufacturerId: number,
    ) {
      const [legacyArticleId] = await mock.getLegacyArticleIds(
        brandId,
        articleNumber,
      );
      const targetIds = await mock.getLinkedTargetIds(
        legacyArticleId,
        manufacturerId,
      );

      return mock.getVehiclesByIds(targetIds);
    }

    // Every step reads the same fixture rows, so a make that offers itself must
    // have vehicles behind it — the fixture would otherwise be useless for the
    // one thing this section is built around.
    it('walks a make to the vehicles behind it', async () => {
      const makes = await makesOf(MANN, 'OF-OC115');
      const bmw = makes.find((make) => make.name === 'BMW')!;

      const vehicles = await vehiclesOf(
        MANN,
        'OF-OC115',
        Number(bmw.manufacturerId),
      );

      expect(makes.length).toBeGreaterThan(1);
      expect(vehicles.length).toBeGreaterThan(1);
      expect(new Set(vehicles.map((row) => row.seriesId)).size).toBeGreaterThan(
        1,
      );
      expect(
        vehicles.every((row) => row.manufacturerId === bmw.manufacturerId),
      ).toBe(true);
    });

    it('carries the full modification detail the table renders', async () => {
      const makes = await makesOf(MANN, 'OF-OC115');
      const [row] = await vehiclesOf(
        MANN,
        'OF-OC115',
        Number(makes[0].manufacturerId),
      );

      expect(row).toMatchObject({
        seriesId: expect.any(String),
        seriesName: expect.any(String),
        manufacturerId: makes[0].manufacturerId,
        vehicle: {
          vehicleId: expect.any(String),
          name: expect.any(String),
          powerKw: expect.any(Number),
          powerHp: expect.any(Number),
          fuelType: expect.any(String),
          engineCodes: [expect.any(String)],
        },
      });
    });

    // The hand-written fixtures fit on one screen at every level, so without a
    // broad one nothing that only shows up at breadth is ever seen in dev.
    it('offers one article broad enough to exercise the disclosure', async () => {
      const makes = await makesOf(MOCK_BRAND, 'TEST-MANY-VEHICLES');

      const vehicles = await vehiclesOf(
        MOCK_BRAND,
        'TEST-MANY-VEHICLES',
        Number(makes[0].manufacturerId),
      );

      expect(makes.length).toBeGreaterThanOrEqual(10);
      expect(vehicles.length).toBeGreaterThan(15);
    });

    it('returns no makes for an article with no catalogued linkages', async () => {
      expect(await makesOf(BOSCH, 'BP-0986494061')).toEqual([]);
    });

    // Unlike the real client the mock never 404s on an unknown part, so the
    // chain has to stop on its own rather than throwing partway through.
    it('resolves an unknown article number to no legacy id', async () => {
      expect(await mock.getLegacyArticleIds(BOSCH, 'NOPE-1')).toEqual([]);
    });

    // The whole point of the OX 982D collision fixture: two suppliers file the
    // number, and each has its own vehicles. Were these ever to answer alike,
    // the fixture would stop catching a brand-blind lookup.
    it('gives each brand of a shared article number its own vehicles', async () => {
      const [knecht, bosch] = await Promise.all([
        makesOf(KNECHT, 'OX 982D'),
        makesOf(BOSCH, 'OX 982D'),
      ]);

      expect(knecht.length).toBeGreaterThan(0);
      expect(bosch.length).toBeGreaterThan(0);
      expect(knecht.map((make) => make.name)).not.toEqual(
        bosch.map((make) => make.name),
      );
    });
  });

  describe('getArticleDetails', () => {
    it('answers with the specs of the brand that was asked for', async () => {
      const [knecht, bosch] = await Promise.all([
        mock.getArticleDetails(KNECHT, 'OX 982D'),
        mock.getArticleDetails(BOSCH, 'OX 982D'),
      ]);

      expect(knecht.detail.brandName).toBe('KNECHT');
      expect(bosch.detail.brandName).toBe('Bosch');
      expect(knecht.detail.technicalSpecs).not.toEqual(
        bosch.detail.technicalSpecs,
      );
    });

    // The cross-reference searches are narrowed by it, so a fixture the drill
    // never reaches would otherwise have no substitutes at all.
    it('carries the product type as the generic article beside the detail', async () => {
      const { genericArticleIds } = await mock.getArticleDetails(
        KNECHT,
        'OX 982D',
      );

      expect(genericArticleIds).toEqual([OIL_FILTER_TYPE]);
    });
  });

  describe('getCrossReferenceCandidates', () => {
    const numbersOf = (candidates: CrossReferenceCandidate[]) =>
      candidates.map((candidate) => candidate.articleNumber);

    // Every brand replacing the same original comes back, which is what makes
    // the result a substitutes list rather than a single part.
    it('returns the parts replacing the same original', async () => {
      const candidates = await mock.getCrossReferenceCandidates(
        'OF-OC115',
        OIL_FILTER_TYPE,
      );

      expect(numbersOf(candidates)).toEqual(
        expect.arrayContaining(['OF-OC115', 'OF-WL7090']),
      );
    });

    // The alternative-numbers section groups the chips per brand, which a
    // single-brand fixture would leave unexercised in dev.
    it('spans several brands so the grouped section has something to group', async () => {
      const candidates = await mock.getCrossReferenceCandidates(
        'OF-OC115',
        OIL_FILTER_TYPE,
      );

      const brands = new Set(
        candidates.map((candidate) => candidate.brandName),
      );

      expect(brands.size).toBeGreaterThan(1);
    });

    /**
     * The service drops every candidate that does not cite the viewed part, so a
     * mock row carrying no citation would never reach a page. Both brands filing
     * the searched number are named, because the search itself is brand-blind —
     * exactly as TecDoc's is.
     */
    it('cites the brands that filed the searched number', async () => {
      const candidates = await mock.getCrossReferenceCandidates(
        'OX 982D',
        OIL_FILTER_TYPE,
      );

      const cited = new Set(
        candidates.flatMap((candidate) =>
          candidate.citedNumbers.map((number) => number.brandId),
        ),
      );

      expect(cited).toEqual(new Set([String(KNECHT), String(BOSCH)]));
    });

    // Equivalence is mutual because it is derived from a shared original rather
    // than declared per part, so neither side can list the other without being
    // listed back.
    it('returns the sharers of an original together', async () => {
      const candidates = await mock.getCrossReferenceCandidates(
        'OX 982D',
        OIL_FILTER_TYPE,
      );

      expect(numbersOf(candidates)).toEqual(
        expect.arrayContaining(['OX 982D', 'HU 6013 z']),
      );
    });

    // The housing shares no original with the filter, and a part of a different
    // type is not a replacement for it however its numbers read.
    it('keeps to the searched part’s own type', async () => {
      const candidates = await mock.getCrossReferenceCandidates(
        'OF-OC115',
        OIL_FILTER_HOUSING,
      );

      expect(candidates).toEqual([]);
    });

    it('returns nothing for a number no fixture files', async () => {
      expect(
        await mock.getCrossReferenceCandidates('NO-SUCH-PART', OIL_FILTER_TYPE),
      ).toEqual([]);
    });
  });

  /**
   * The inverse of the minted `legacyArticleId`s: a candidate is turned back into
   * a row by the id it carries, which is the only way a substitute reaches a
   * page.
   */
  describe('getArticleRowsByLegacyIds', () => {
    it('hydrates a candidate back into the row it came from', async () => {
      const [candidate] = await mock.getCrossReferenceCandidates(
        'OX 982D',
        OIL_FILTER_TYPE,
      );

      const rows = await mock.getArticleRowsByLegacyIds(
        candidate.legacyArticleIds,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].articleNumber).toBe(candidate.articleNumber);
      expect(rows[0].brandId).toBe(candidate.brandId);
    });

    it('answers only for the ids it knows', async () => {
      expect(await mock.getArticleRowsByLegacyIds([404_404])).toEqual([]);
    });
  });
});
