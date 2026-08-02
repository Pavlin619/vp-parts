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

      const categoryNodeId = await brakePadCategoryNodeId();

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
        { categoryNodeId },
      );

      const leaf = await mock.searchArticles(
        'Brake Pad',
        undefined,
        { type: TecDocSearchType.FreeText },
        1,
        50,
        { categoryNodeId, categoryHasChildren: false },
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

  // Facet ids travel to the client as strings (the DTO contract) and come back
  // as numbers (parsed at the query boundary), so the round-trip goes through
  // Number here exactly as it does in SearchQueryDto.
  async function brakePadCategoryNodeId(): Promise<number> {
    const unfiltered = await mock.searchArticles('Brake Pad', undefined, {
      type: TecDocSearchType.FreeText,
    });
    const option = unfiltered.categoryNavigation.options.find(
      (candidate) => candidate.label === 'Brake Pad Set, disc brake',
    );

    if (!option) {
      throw new Error('Fixture no longer exposes the brake pad category');
    }

    return Number(option.id);
  }

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

  describe('linked vehicles', () => {
    /**
     * Walks the mock's three steps exactly as ArticlesService does, so the
     * fixture assertions below also prove the chain between article number,
     * legacy id, and target id holds together.
     */
    const MANN = 72;
    const KNECHT = 94;
    const BOSCH = 30;

    async function linkedVehicles(brandId: number, articleNumber: string) {
      const legacyArticleIds = await mock.getLegacyArticleIds(
        brandId,
        articleNumber,
      );

      const targetIds = await Promise.all(
        legacyArticleIds.map((id) => mock.getLinkedTargetIds(id)),
      );

      return mock.getLinkageTargets(targetIds.flat());
    }

    // The section groups make → series → modification, so a fixture confined to
    // one make would leave both levels of that disclosure unexercised in dev.
    it('spans several makes and series so the grouped section has something to group', async () => {
      const vehicles = await linkedVehicles(MANN, 'OF-OC115');

      const makes = new Set(vehicles.map((v) => v.manufacturerName));
      const series = new Set(vehicles.map((v) => v.modelSeriesName));

      expect(makes.size).toBeGreaterThan(1);
      expect(series.size).toBeGreaterThan(makes.size);
    });

    it('carries the full modification detail the table renders', async () => {
      const [vehicle] = await linkedVehicles(MANN, 'OF-OC115');

      expect(vehicle).toMatchObject({
        vehicleId: expect.any(String),
        manufacturerName: 'BMW',
        modelSeriesName: expect.any(String),
        name: expect.any(String),
        powerKw: expect.any(Number),
        powerHp: expect.any(Number),
        fuelType: expect.any(String),
        engineCode: expect.any(String),
      });
    });

    it('leaves a model still in production without an end year', async () => {
      const vehicles = await linkedVehicles(MANN, 'OF-OC115');

      expect(vehicles.some((v) => v.yearTo === null)).toBe(true);
    });

    it('returns no vehicles for an article with no catalogued linkages', async () => {
      expect(await linkedVehicles(BOSCH, 'BP-0986494061')).toEqual([]);
    });

    // Unlike the real client the mock never 404s on an unknown part, so the
    // chain has to stop on its own rather than throwing partway through.
    it('resolves an unknown article number to no legacy ids', async () => {
      expect(await mock.getLegacyArticleIds(BOSCH, 'NOPE-1')).toEqual([]);
    });

    // The whole point of the OX 982D collision fixture: two suppliers file the
    // number, and each has its own vehicles. Were these ever to answer alike,
    // the fixture would stop catching a brand-blind lookup.
    it('gives each brand of a shared article number its own vehicles', async () => {
      const [knecht, bosch] = await Promise.all([
        linkedVehicles(KNECHT, 'OX 982D'),
        linkedVehicles(BOSCH, 'OX 982D'),
      ]);

      expect(knecht.length).toBeGreaterThan(0);
      expect(bosch.length).toBeGreaterThan(0);
      expect(knecht.map((v) => v.vehicleId)).not.toEqual(
        bosch.map((v) => v.vehicleId),
      );
    });
  });

  describe('getArticleDetails', () => {
    it('answers with the specs of the brand that was asked for', async () => {
      const [knecht, bosch] = await Promise.all([
        mock.getArticleDetails(94, 'OX 982D'),
        mock.getArticleDetails(30, 'OX 982D'),
      ]);

      expect(knecht.brandName).toBe('KNECHT');
      expect(bosch.brandName).toBe('Bosch');
      expect(knecht.technicalSpecs).not.toEqual(bosch.technicalSpecs);
    });
  });

  describe('getSubstitutes', () => {
    // Cross-references are mutual in TecDoc, so a part listed as another's
    // comparable must list that other part back — otherwise the
    // alternative-numbers section of one row contradicts the other's.
    it('cross-references the oil filters both ways', async () => {
      const [forKnecht, forMann] = await Promise.all([
        mock.getSubstitutes('OX 982D'),
        mock.getSubstitutes('OF-OC115'),
      ]);

      expect(forKnecht.map((part) => part.articleNumber)).toContain('OF-OC115');
      expect(forMann.map((part) => part.articleNumber)).toContain('OX 982D');
    });

    // The alternative-numbers section groups the chips per brand, which a
    // single-brand fixture would leave unexercised in dev.
    it('spans several brands so the grouped section has something to group', async () => {
      const substitutes = await mock.getSubstitutes('OX 982D');

      const brands = new Set(substitutes.map((part) => part.brandName));

      expect(brands.size).toBeGreaterThan(1);
    });

    it('returns no substitutes for an article with no cross-references', async () => {
      expect(await mock.getSubstitutes('BP-0986494061')).toEqual([]);
    });
  });
});
