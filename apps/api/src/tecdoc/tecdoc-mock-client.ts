import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  BrandDto,
  PaginatedCatalogArticlesDto,
  PaginatedSearchArticlesDto,
  SearchFacetDto,
  FacetValueDto,
  AttributeFacetDto,
  AttributeFacetValueDto,
  CategoryNavigationDto,
  CategoryOptionDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  ArticleAutocompleteItemDto,
  CategoryAutocompleteItemDto,
  AutocompleteItemDto,
  TermAutocompleteItemDto,
} from '@vp-parts-shop/shared';
import {
  SearchExecution,
  SearchFilters,
  TecDocSearchType,
  AUTOCOMPLETE_SUGGESTIONS_LIMIT,
  CATEGORY_AUTOCOMPLETE_LIMIT,
  attributeRoleFor,
  shouldRequestCriteriaFacets,
} from '../search/search-types';

// TODO: delete this class ones we have finished the contract with TECDOC

/**
 * The bare row fields the mock stores per article. The richer summary fields
 * (specs, OE numbers, brand logo, fit) are derived at read time in
 * {@link TecDocMockClient.toSummary}, mirroring how the real client fills them
 * from a single `getArticles` (`includeAll`) response plus the brand-logo join.
 */
type MockArticleBase = Pick<
  ArticleSummaryDto,
  'articleNumber' | 'brandName' | 'description' | 'thumbnailUrl'
>;

const MANUFACTURERS: ManufacturerDto[] = [
  { id: '16', name: 'Volkswagen' },
  { id: '5', name: 'BMW' },
  { id: '165', name: 'Toyota' },
  { id: '35', name: 'Ford' },
];

const MODEL_SERIES: Record<string, ModelSeriesDto[]> = {
  '16': [
    { id: '2', manufacturerId: '16', name: 'Golf' },
    { id: '3', manufacturerId: '16', name: 'Passat' },
    { id: '4', manufacturerId: '16', name: 'Polo' },
  ],
  '5': [
    { id: '10', manufacturerId: '5', name: '3 Series' },
    { id: '11', manufacturerId: '5', name: '5 Series' },
  ],
  '165': [{ id: '20', manufacturerId: '165', name: 'Corolla' }],
  '35': [{ id: '30', manufacturerId: '35', name: 'Focus' }],
};

const VEHICLE_VARIANTS: Record<string, VehicleVariantDto[]> = {
  '2': [
    {
      vehicleId: '10001',
      seriesId: '2',
      name: 'Golf VII 2.0 TDI',
      yearFrom: 2012,
      yearTo: 2020,
      engine: 'CRBC',
      powerKw: 110,
      fuelType: 'Diesel',
      bodyType: 'Hatchback',
    },
    {
      vehicleId: '10002',
      seriesId: '2',
      name: 'Golf VII 1.4 TSI',
      yearFrom: 2013,
      yearTo: 2020,
      engine: 'CZEA',
      powerKw: 92,
      fuelType: 'Petrol',
      bodyType: 'Hatchback',
    },
  ],
  '3': [
    {
      vehicleId: '10010',
      seriesId: '3',
      name: 'Passat B8 2.0 TDI',
      yearFrom: 2014,
      yearTo: null,
      engine: 'DFCA',
      powerKw: 110,
      fuelType: 'Diesel',
      bodyType: 'Saloon',
    },
  ],
  '10': [
    {
      vehicleId: '10020',
      seriesId: '10',
      name: 'BMW 320d (F30)',
      yearFrom: 2011,
      yearTo: 2019,
      engine: 'N47D20C',
      powerKw: 135,
      fuelType: 'Diesel',
      bodyType: 'Saloon',
    },
  ],
};

const ASSEMBLY_GROUPS: AssemblyGroupDto[] = [
  { id: '100001', name: 'Brake System', parentId: null },
  { id: '100002', name: 'Brake Discs', parentId: '100001' },
  { id: '100003', name: 'Brake Pads', parentId: '100001' },
  { id: '200001', name: 'Engine', parentId: null },
  { id: '200002', name: 'Oil Filters', parentId: '200001' },
  { id: '200003', name: 'Air Filters', parentId: '200001' },
  { id: '300001', name: 'Suspension', parentId: null },
  { id: '300002', name: 'Shock Absorbers', parentId: '300001' },
];

// Mock brand logos so the FE can render the brand mark before the real TecDoc
// getBrands integration is enabled. Brand names match the parts above exactly;
// the catalog layer joins them onto an article by brand name. The URLs are
// placeholder images (real logos arrive once getBrands is wired to TecDoc).
const BRANDS: BrandDto[] = [
  {
    brandName: 'Bosch',
    logoUrl: 'https://placehold.co/240x80/eef2ff/1e3a8a.png?text=BOSCH',
  },
  {
    brandName: 'MANN-FILTER',
    logoUrl: 'https://placehold.co/240x80/fffbeb/b45309.png?text=MANN-FILTER',
  },
  {
    brandName: 'KNECHT',
    logoUrl: 'https://placehold.co/240x80/eff6ff/1d4ed8.png?text=KNECHT',
  },
  {
    brandName: 'Ferodo',
    logoUrl: 'https://placehold.co/240x80/fef2f2/991b1b.png?text=Ferodo',
  },
  {
    brandName: 'WIX Filters',
    logoUrl: 'https://placehold.co/240x80/f0fdf4/166534.png?text=WIX+Filters',
  },
  {
    brandName: 'Monroe',
    logoUrl: 'https://placehold.co/240x80/f8fafc/0f172a.png?text=Monroe',
  },
];

const ARTICLES_BY_CATEGORY: Record<string, MockArticleBase[]> = {
  '100002': [
    {
      articleNumber: 'BD-0986478451',
      brandName: 'Bosch',
      description: 'Brake Disc',
      thumbnailUrl:
        'https://digitalassets.tecalliance.services/images/800/mock-brake-disc.jpg',
    },
    {
      articleNumber: 'BD-DF4074',
      brandName: 'Ferodo',
      description: 'Brake Disc',
      thumbnailUrl: null,
    },
  ],
  '100003': [
    {
      articleNumber: 'BP-0986494061',
      brandName: 'Bosch',
      description: 'Brake Pad Set, disc brake',
      thumbnailUrl: null,
    },
    // Rear-axle counterpart so the "Позиция на монтаж" (fitting position) facet
    // has both front/rear values in dev — exercises the role: 'fitting-position'
    // special control on the FE.
    {
      articleNumber: 'BP-DF4145',
      brandName: 'Ferodo',
      description: 'Brake Pad Set, disc brake',
      thumbnailUrl: null,
    },
  ],
  '200002': [
    {
      articleNumber: 'OF-OC115',
      brandName: 'MANN-FILTER',
      description: 'Oil Filter',
      thumbnailUrl:
        'https://digitalassets.tecalliance.services/images/800/mock-oil-filter.jpg',
    },
    {
      articleNumber: 'OF-WL7090',
      brandName: 'WIX Filters',
      description: 'Oil Filter',
      thumbnailUrl: null,
    },
    {
      articleNumber: 'OX 982D',
      brandName: 'KNECHT',
      description: 'Oil Filter',
      thumbnailUrl:
        'https://digitalassets.tecalliance.services/images/800/mock-oil-filter.jpg',
    },
    // Catalog-only part: full TecDoc details but intentionally NO row in
    // public.autoparts / public.supplier_stock, so the buy box has no price or
    // availability. Exercises the "Не е наличен" (no data) state.
    {
      articleNumber: 'OF-HU816X',
      brandName: 'MANN-FILTER',
      description: 'Oil Filter',
      thumbnailUrl:
        'https://digitalassets.tecalliance.services/images/800/mock-oil-filter.jpg',
    },
    // Synthetic availability test parts. These are listed here only so they are
    // searchable/browsable; their price & stock come from the mock seed in
    // infra/db/02-mock-stock-seed.sql (see that file for each scenario).
    {
      articleNumber: 'TEST-QTY-1',
      brandName: 'MockBrand',
      description: 'ТЕСТ · единична бройка (лимит 1)',
      thumbnailUrl: null,
    },
    {
      articleNumber: 'TEST-QTY-SPLIT',
      brandName: 'MockBrand',
      description: 'ТЕСТ · тънка наличност в 3 склада',
      thumbnailUrl: null,
    },
    {
      articleNumber: 'TEST-QTY-ZERO-FAST',
      brandName: 'MockBrand',
      description: 'ТЕСТ · празен бърз склад',
      thumbnailUrl: null,
    },
    {
      articleNumber: 'TEST-OOS',
      brandName: 'MockBrand',
      description: 'ТЕСТ · изчерпан (доставчик с 0)',
      thumbnailUrl: null,
    },
    {
      articleNumber: 'TEST-BAD-WAREHOUSE',
      brandName: 'MockBrand',
      description: 'ТЕСТ · неизвестен склад',
      thumbnailUrl: null,
    },
    {
      articleNumber: 'TEST-OWN-ZERO',
      brandName: 'MockBrand',
      description: 'ТЕСТ · собствена наличност 0',
      thumbnailUrl: null,
    },
    {
      articleNumber: 'TEST-OWN-PREMIUM',
      brandName: 'MockBrand',
      description: 'ТЕСТ · собствена по-висока цена',
      thumbnailUrl: null,
    },
  ],
  '200003': [
    {
      articleNumber: 'AF-C2585',
      brandName: 'MANN-FILTER',
      description: 'Air Filter',
      thumbnailUrl: null,
    },
  ],
  '300002': [
    {
      articleNumber: 'SA-343347',
      brandName: 'Monroe',
      description: 'Shock Absorber',
      thumbnailUrl: null,
    },
  ],
};

// Comparable (cross-reference) parts keyed by the article being viewed — the
// mock stand-in for TecDoc getArticles searchType 3. OX 982D returns the same
// oil filter from other data suppliers so the "Заменки" tab lights up in dev.
const SUBSTITUTES_BY_ARTICLE: Record<string, MockArticleBase[]> = {
  'OX 982D': [
    {
      articleNumber: 'OF-OC115',
      brandName: 'MANN-FILTER',
      description: 'Oil Filter',
      thumbnailUrl:
        'https://digitalassets.tecalliance.services/images/800/mock-oil-filter.jpg',
    },
    {
      articleNumber: 'OF-WL7090',
      brandName: 'WIX Filters',
      description: 'Oil Filter',
      thumbnailUrl: null,
    },
    {
      articleNumber: 'OF-HU816X',
      brandName: 'MANN-FILTER',
      description: 'Oil Filter',
      thumbnailUrl:
        'https://digitalassets.tecalliance.services/images/800/mock-oil-filter.jpg',
    },
  ],
};

/**
 * Builds a small gallery of placeholder images for a mock article. Real TecDoc
 * returns several images per article (product shot, line drawing, packaging,
 * …), so the mock mirrors that with a few labelled, actually-loading
 * placeholders — otherwise the detail gallery only ever shows one photo and the
 * thumbnail strip never appears in dev. Uses placehold.co (whitelisted in
 * apps/web/next.config.ts) so the images render.
 */
function mockGallery(label: string): string[] {
  const backgrounds = ['1d4ed8', '0f766e', '9333ea', 'b45309'];

  return backgrounds.map((background, index) => {
    const text = `${label.replace(/ /g, '+')}+${index + 1}`;
    return `https://placehold.co/800x800/${background}/ffffff.png?text=${text}`;
  });
}

const BRAKE_DISC_IMAGES = mockGallery('Brake Disc');
const OIL_FILTER_IMAGES = mockGallery('Oil Filter');

const ARTICLE_DETAILS: Record<string, ArticleCatalogDetailDto> = {
  // Front/rear brake-pad pair. The "Позиция на монтаж" spec maps to the
  // fitting-position role (see ATTRIBUTE_ROLE_BY_ID) so the mock surfaces a
  // role-tagged attribute facet once the brake-pad leaf category is selected.
  'BP-0986494061': {
    articleNumber: 'BP-0986494061',
    brandName: 'Bosch',
    brandLogoUrl: null,
    description: 'Brake Pad Set, disc brake',
    thumbnailUrl: null,
    images: [],
    technicalSpecs: [
      { key: 'Позиция на монтаж', value: 'Отпред' },
      { key: 'Width', value: '155.1 mm' },
      { key: 'Height', value: '66 mm' },
    ],
    oemNumbers: ['1K0 698 151 B'],
    compatibleVehicles: [],
    fitsVehicle: null,
  },
  'BP-DF4145': {
    articleNumber: 'BP-DF4145',
    brandName: 'Ferodo',
    brandLogoUrl: null,
    description: 'Brake Pad Set, disc brake',
    thumbnailUrl: null,
    images: [],
    technicalSpecs: [
      { key: 'Позиция на монтаж', value: 'Отзад' },
      { key: 'Width', value: '105.3 mm' },
      { key: 'Height', value: '55.9 mm' },
    ],
    oemNumbers: ['5Q0 698 451'],
    compatibleVehicles: [],
    fitsVehicle: null,
  },
  'BD-0986478451': {
    articleNumber: 'BD-0986478451',
    brandName: 'Bosch',
    brandLogoUrl: null,
    description: 'Brake Disc',
    thumbnailUrl: BRAKE_DISC_IMAGES[0],
    images: BRAKE_DISC_IMAGES,
    technicalSpecs: [
      { key: 'Diameter', value: '288 mm' },
      { key: 'Brake Disc Type', value: 'Internally Vented' },
      { key: 'Minimum Thickness', value: '25 mm' },
    ],
    oemNumbers: ['1K0 615 301 AA', '1K0 615 301 R'],
    compatibleVehicles: [],
    fitsVehicle: null,
  },
  'OF-OC115': {
    articleNumber: 'OF-OC115',
    brandName: 'MANN-FILTER',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: OIL_FILTER_IMAGES[0],
    images: OIL_FILTER_IMAGES,
    technicalSpecs: [
      { key: 'Height', value: '89 mm' },
      { key: 'Outer Diameter 1', value: '76 mm' },
      { key: 'Thread Size', value: 'M 20 X 1.5' },
    ],
    // Shares OE 06J 115 403 Q with OF-WL7090 so an OE-number search returns
    // both brands — the "one OE, many aftermarket options" multi-result case.
    oemNumbers: ['06J 115 403 Q', '06H 115 562'],
    compatibleVehicles: [],
    fitsVehicle: null,
  },
  // Second aftermarket oil filter for VW OE 06J 115 403 Q. Paired with OF-OC115
  // so searching that OE number lands on the multi-result search page (both are
  // stocked in infra/db/02-mock-stock-seed.sql, so live prices render too).
  'OF-WL7090': {
    articleNumber: 'OF-WL7090',
    brandName: 'WIX Filters',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: OIL_FILTER_IMAGES[0],
    images: OIL_FILTER_IMAGES,
    technicalSpecs: [
      { key: 'Height', value: '90 mm' },
      { key: 'Outer Diameter 1', value: '76 mm' },
      { key: 'Thread Size', value: 'M 20 X 1.5' },
    ],
    oemNumbers: ['06J 115 403 Q', '06J 115 403 C'],
    compatibleVehicles: [],
    fitsVehicle: null,
  },
  // Real Knecht/Mahle OX 982D oil filter insert (Mercedes-Benz M270/M274 &
  // Infiniti). Specs sourced from the manufacturer data sheet so the data is
  // legit for testing — this part is stocked across most of our suppliers.
  'OX 982D': {
    articleNumber: 'OX 982D',
    brandName: 'KNECHT',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: OIL_FILTER_IMAGES[0],
    images: OIL_FILTER_IMAGES,
    technicalSpecs: [
      { key: 'Filter type', value: 'Filter Insert' },
      { key: 'Diameter', value: '71.0 mm' },
      { key: 'Height', value: '86.5 mm' },
      { key: 'Inner Diameter 2', value: '34 mm' },
      { key: 'Inner Diameter 3', value: '28.6 mm' },
      { key: 'Supplementary Info', value: 'with gaskets/seals' },
    ],
    oemNumbers: [
      'A2701800009',
      'A2701800109',
      'A2701840025',
      'A2701840125',
      '2701800009',
      '2701800109',
      '15208HG00D',
    ],
    compatibleVehicles: [],
    fitsVehicle: null,
  },
  // Rich TecDoc details with NO stock/price data in the DB — the buy box shows
  // no price ("—") and the "Не е наличен" notice, while the page chrome (images,
  // specs, OEMs) still renders fully.
  'OF-HU816X': {
    articleNumber: 'OF-HU816X',
    brandName: 'MANN-FILTER',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: OIL_FILTER_IMAGES[0],
    images: OIL_FILTER_IMAGES,
    technicalSpecs: [
      { key: 'Filter type', value: 'Filter Insert' },
      { key: 'Outer Diameter', value: '64 mm' },
      { key: 'Height', value: '141 mm' },
      { key: 'Inner Diameter', value: '27.5 mm' },
    ],
    oemNumbers: ['11427508969', '11427541827'],
    compatibleVehicles: [],
    fitsVehicle: null,
  },
};

const DEFAULT_ARTICLE_DETAIL: ArticleCatalogDetailDto = {
  articleNumber: '',
  brandName: 'Unknown',
  brandLogoUrl: null,
  description: 'Auto Part',
  thumbnailUrl: null,
  images: [],
  technicalSpecs: [],
  oemNumbers: [],
  compatibleVehicles: [],
  fitsVehicle: null,
};

export class TecDocMockClient {
  getManufacturers(): Promise<ManufacturerDto[]> {
    return Promise.resolve(MANUFACTURERS);
  }

  getModelSeries(manufacturerId: string): Promise<ModelSeriesDto[]> {
    return Promise.resolve(MODEL_SERIES[manufacturerId] ?? []);
  }

  getVehicleTypes(seriesId: string): Promise<VehicleVariantDto[]> {
    return Promise.resolve(VEHICLE_VARIANTS[seriesId] ?? []);
  }

  getAssemblyGroupTree(_vehicleId: string): Promise<AssemblyGroupDto[]> {
    return Promise.resolve(ASSEMBLY_GROUPS);
  }

  getBrands(): Promise<BrandDto[]> {
    return Promise.resolve(BRANDS);
  }

  getArticles(
    _vehicleId: string,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    const all = ARTICLES_BY_CATEGORY[categoryId] ?? [];
    const start = (page - 1) * pageSize;
    const items = all
      .slice(start, start + pageSize)
      .map((base) => this.toSummary(base));

    return Promise.resolve({ total: all.length, page, pageSize, items });
  }

  searchArticles(
    query: string,
    vehicleId?: string,
    execution?: SearchExecution,
    page = 1,
    pageSize = 50,
    filters?: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    // Free-text (type 99) matches on description/brand words; number searches
    // (type 10) match on article/OE numbers — mirroring the real client's split.
    const baseMatches =
      execution?.type === TecDocSearchType.FreeText
        ? this.findByDescription(query)
        : this.findMatchingArticles(query);

    const matches = baseMatches
      // The mock dataset has no per-vehicle linkage; a vehicle-scoped search
      // returns every other match so fit indicators show both states.
      .filter((_, index) => vehicleId == null || index % 2 === 0)
      .map((base) => this.toSummary(base))
      .filter((item) => this.matchesFilters(item, filters));

    const facets = this.buildFacets(matches);
    const categoryNavigation = this.buildCategoryNavigation(matches, filters);

    // Attribute facets only make sense once the search has landed on a leaf
    // category — mirror the real client's gates. The request-side gate stands in
    // for "did we ask TecDoc for criteria at all"; the leaf gate then decides
    // whether to surface them (mock nodes are all leaves, so a selected node has
    // hasChildren=false).
    const categorySelected = Boolean(filters?.categoryNodeId);
    const atLeaf =
      categorySelected &&
      (categoryNavigation.current
        ? categoryNavigation.current.hasChildren === false
        : categoryNavigation.options.length === 0);
    const attributes =
      atLeaf && shouldRequestCriteriaFacets(filters, page)
        ? this.buildAttributeFacets(matches)
        : [];

    const start = (page - 1) * pageSize;
    const items = matches.slice(start, start + pageSize);

    return Promise.resolve({
      total: matches.length,
      page,
      pageSize,
      items,
      facets,
      attributes,
      categoryNavigation,
    });
  }

  /**
   * Mirrors the real client's article autocomplete (`getArticles`): number
   * matches capped at the shared limit. An `exact` execution keeps only exact
   * number matches (mirroring the exact-number toggle); any other match type
   * behaves like a prefix/substring search. Like the real client, it also
   * appends the categories the matches fall into (built from the match set, the
   * mock's stand-in for `assemblyGroupFacets`) when they span more than one.
   */
  getAutocompleteArticles(
    query: string,
    execution?: SearchExecution,
  ): Promise<AutocompleteItemDto[]> {
    const normalisedQuery = query.replace(/[-.\s]/g, '').toUpperCase();

    const matches =
      execution?.matchType === 'exact'
        ? this.findMatchingArticles(query).filter(
            (article) =>
              article.articleNumber.replace(/[-.\s]/g, '').toUpperCase() ===
              normalisedQuery,
          )
        : this.findMatchingArticles(query);

    const articles: ArticleAutocompleteItemDto[] = matches
      .slice(0, AUTOCOMPLETE_SUGGESTIONS_LIMIT)
      .map(({ articleNumber, brandName, description }) => ({
        kind: 'article' as const,
        articleNumber,
        brandName,
        description,
      }));

    const categories = this.buildAutocompleteCategorySuggestions(
      query,
      matches,
    );

    return Promise.resolve([...articles, ...categories]);
  }

  /**
   * Mirrors the real client's category suggestions (from `assemblyGroupFacets`):
   * the distinct categories the matches fall into — the mock keys categories on
   * the description (id = label), like {@link buildCategoryNavigation} — emitted
   * only when the matches span more than one category, ordered by count and
   * capped at {@link CATEGORY_AUTOCOMPLETE_LIMIT}.
   */
  private buildAutocompleteCategorySuggestions(
    query: string,
    matches: MockArticleBase[],
  ): CategoryAutocompleteItemDto[] {
    const countByLabel = new Map<string, number>();

    for (const article of matches) {
      countByLabel.set(
        article.description,
        (countByLabel.get(article.description) ?? 0) + 1,
      );
    }

    if (countByLabel.size <= 1) {
      return [];
    }

    return [...countByLabel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, CATEGORY_AUTOCOMPLETE_LIMIT)
      .map(([label, count]) => ({
        kind: 'category' as const,
        term: query,
        categoryNodeId: label,
        label,
        count,
      }));
  }

  /**
   * Mirrors the real client's term autocomplete (`getAutoCompleteSuggestions`):
   * the distinct free-text descriptions matching the typed input, meant to be
   * re-run as a generic search. Matches on description/brand words like the
   * mock's free-text search so "oil" suggests the "Oil Filter" term.
   */
  getAutocompleteTerms(query: string): Promise<TermAutocompleteItemDto[]> {
    const terms = [
      ...new Set(
        this.findByDescription(query).map((article) => article.description),
      ),
    ]
      .slice(0, AUTOCOMPLETE_SUGGESTIONS_LIMIT)
      .map((term) => ({ kind: 'term' as const, term }));

    return Promise.resolve(terms);
  }

  getArticleDetails(
    articleNumber: string,
    _vehicleId?: string,
  ): Promise<ArticleCatalogDetailDto> {
    const base = ARTICLE_DETAILS[articleNumber] ?? {
      ...DEFAULT_ARTICLE_DETAIL,
      articleNumber,
    };

    return Promise.resolve(base);
  }

  getSubstitutes(articleNumber: string): Promise<ArticleSummaryDto[]> {
    const substitutes = (SUBSTITUTES_BY_ARTICLE[articleNumber] ?? []).map(
      (base) => this.toSummary(base),
    );

    return Promise.resolve(substitutes);
  }

  /**
   * Expands a bare mock row into the shared summary shape. Specs and OE numbers
   * are borrowed from the article's detail fixture when present (mirroring how
   * the real client gets them free on the same `getArticles` response);
   * `brandLogoUrl` stays null because the brands layer joins logos from
   * getBrands, exactly as it does for the real client.
   */
  private toSummary(base: MockArticleBase): ArticleSummaryDto {
    const detail = ARTICLE_DETAILS[base.articleNumber];

    return {
      ...base,
      brandLogoUrl: null,
      technicalSpecs: detail?.technicalSpecs ?? [],
      oemNumbers: detail?.oemNumbers ?? [],
      fitsVehicle: null,
    };
  }

  private findMatchingArticles(query: string) {
    const normalisedQuery = query.replace(/[-.\s]/g, '').toUpperCase();

    return Object.values(ARTICLES_BY_CATEGORY)
      .flat()
      .filter((article) => this.matchesNumber(article, normalisedQuery));
  }

  /**
   * Mirrors the real client's `getArticles` searchType 99 (free text): a hit
   * requires every query word to appear in the article description or brand
   * name (case-insensitive), so "oil filter bosch" matches Bosch oil filters via
   * the brand token — the query is used as typed, with no brand stripping.
   */
  private findByDescription(query: string) {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 0);

    if (tokens.length === 0) {
      return [];
    }

    return Object.values(ARTICLES_BY_CATEGORY)
      .flat()
      .filter((article) => {
        const haystack =
          `${article.description} ${article.brandName}`.toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
  }

  /**
   * Mirrors the real client's `getArticles` searchType 10 ("any number"): a
   * query hits when it is a substring of the article number OR of any of the
   * part's OE numbers. Numbers are compared with spaces/hyphens/dots stripped,
   * matching how TecDoc normalises them server-side. The other number types
   * searchType 10 also covers (trade, comparable, replacement, EAN) are not
   * modelled in the mock.
   */
  private matchesNumber(
    article: MockArticleBase,
    normalisedQuery: string,
  ): boolean {
    const candidateNumbers = [
      article.articleNumber,
      ...(ARTICLE_DETAILS[article.articleNumber]?.oemNumbers ?? []),
    ];

    return candidateNumbers.some((number) =>
      number
        .replace(/[-.\s]/g, '')
        .toUpperCase()
        .includes(normalisedQuery),
    );
  }

  /**
   * Applies the active facet selections to a mock row. The mock has no numeric
   * TecDoc ids, so brand facets key on `brandName`, category-tree nodes on
   * `description`, and attribute facets on a `key:value` technical-spec pair —
   * the same values the builders below emit as facet ids. Groups are
   * AND-combined; a missing or empty group matches everything.
   */
  private matchesFilters(
    article: ArticleSummaryDto,
    filters?: SearchFilters,
  ): boolean {
    const brandOk =
      !filters?.brandIds?.length ||
      filters.brandIds.includes(article.brandName);

    const categoryOk =
      !filters?.categoryNodeId ||
      filters.categoryNodeId === article.description;

    const criteriaOk =
      !filters?.criteria?.length ||
      filters.criteria.every((selected) =>
        article.technicalSpecs.some(
          (spec) =>
            spec.key === selected.criteriaId &&
            spec.value === selected.rawValue,
        ),
      );

    return brandOk && categoryOk && criteriaOk;
  }

  /**
   * Builds the brand facet counts over the matched set, mirroring the real
   * client's `dataSupplierFacets`. Ids equal the labels (mock has no numeric
   * ids) so a selection round-trips through {@link matchesFilters}; brand logos
   * stay null for the catalog layer to join.
   */
  private buildFacets(items: ArticleSummaryDto[]): SearchFacetDto[] {
    const brandValues = this.countBy(
      items,
      (item) => item.brandName,
      (label) => ({ id: label, label, count: 0, imageUrl: null }),
    );

    return brandValues.length > 0
      ? [{ id: 'brands', label: 'Производител', values: brandValues }]
      : [];
  }

  /**
   * Builds attribute (criteria) facets from the matched set's technical specs,
   * mirroring the real client's `criteriaFacets`. Each distinct spec key becomes
   * one facet group and each distinct value a selectable value; the id/value
   * equal the spec's key/value so a selection round-trips through
   * {@link matchesFilters}.
   */
  private buildAttributeFacets(
    items: ArticleSummaryDto[],
  ): AttributeFacetDto[] {
    const byKey = new Map<string, Map<string, AttributeFacetValueDto>>();

    for (const item of items) {
      for (const spec of item.technicalSpecs) {
        const valuesByRaw =
          byKey.get(spec.key) ?? new Map<string, AttributeFacetValueDto>();
        const value = valuesByRaw.get(spec.value) ?? {
          value: spec.value,
          label: spec.value,
          count: 0,
        };
        value.count += 1;
        valuesByRaw.set(spec.value, value);
        byKey.set(spec.key, valuesByRaw);
      }
    }

    return [...byKey.entries()].map(([key, valuesByRaw]) => ({
      id: key,
      label: key,
      unit: null,
      type: 'A',
      isInterval: false,
      role: attributeRoleFor(key),
      values: [...valuesByRaw.values()],
    }));
  }

  /**
   * Builds single-level category navigation from the matched set's descriptions,
   * mirroring the real client. Mock categories are a flat single level (each
   * distinct description is a root leaf whose id is the description): a broad
   * search exposes them all as `options`; selecting one narrows the match set to
   * that description, so it becomes `current` with no further `options` (a leaf).
   */
  private buildCategoryNavigation(
    items: ArticleSummaryDto[],
    filters?: SearchFilters,
  ): CategoryNavigationDto {
    const selectedNodeId = filters?.categoryNodeId;
    const countByLabel = new Map<string, number>();

    for (const item of items) {
      countByLabel.set(
        item.description,
        (countByLabel.get(item.description) ?? 0) + 1,
      );
    }

    const nodes: CategoryOptionDto[] = [...countByLabel.entries()].map(
      ([label, count]) => ({ id: label, label, count, hasChildren: false }),
    );

    if (selectedNodeId) {
      const current = nodes.find((node) => node.id === selectedNodeId) ?? null;
      return { current, options: [] };
    }

    return { current: null, options: nodes };
  }

  private countBy(
    items: ArticleSummaryDto[],
    keyOf: (item: ArticleSummaryDto) => string,
    seed: (label: string) => FacetValueDto,
  ): FacetValueDto[] {
    const byLabel = new Map<string, FacetValueDto>();

    for (const item of items) {
      const label = keyOf(item);
      const value = byLabel.get(label) ?? seed(label);
      value.count += 1;
      byLabel.set(label, value);
    }

    return [...byLabel.values()];
  }
}
