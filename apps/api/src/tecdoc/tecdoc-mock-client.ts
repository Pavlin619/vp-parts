import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  BrandDto,
  PaginatedSearchArticlesDto,
  SearchFacetDto,
  FacetValueDto,
  AttributeFacetDto,
  AttributeFacetValueDto,
  CategoryNavigationDto,
  CategoryOptionDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  LinkedVehicleDto,
  LinkedVehicleManufacturerDto,
  OemNumberDto,
  ArticleAutocompleteItemDto,
  CategoryAutocompleteItemDto,
  AutocompleteItemDto,
  TermAutocompleteItemDto,
} from '@vp-parts-shop/shared';
import type {
  ArticleLinkageRoles,
  CatalogArticlesPage,
} from './article-mapper';
import type { LinkedVehicleWithSeries } from './linked-vehicle';
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

/**
 * Stand-in TecDoc `dataSupplierId`s, one per mock brand. Arbitrary but stable:
 * what matters is that the mock can key an article on brand + number the way
 * the real catalogue does, so mock mode exercises the same identity as
 * production instead of pretending a number is unique.
 */
const BRAND_ID_BY_NAME: Record<string, string> = {
  Bosch: '30',
  'MANN-FILTER': '72',
  KNECHT: '94',
  Ferodo: '101',
  'WIX Filters': '268',
  Monroe: '4346',
  MockBrand: '99001',
};

function brandIdFor(brandName: string): string {
  return BRAND_ID_BY_NAME[brandName] ?? '0';
}

/** The mock's article identity: the brand id and number, same as TecDoc's. */
function articleKey(brandId: string, articleNumber: string): string {
  return `${brandId}:${articleNumber}`;
}

function articleKeyForBrandName(
  brandName: string,
  articleNumber: string,
): string {
  return articleKey(brandIdFor(brandName), articleNumber);
}

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

/**
 * Stable numeric ids for the labels the mock builds its facets from — brand
 * names, technical-spec keys and article descriptions.
 *
 * Real TecDoc facets are keyed by numbers (`dataSupplierId`, `criteriaId`,
 * `assemblyGroupNodeId`) and the API validates them as such at its boundary, so
 * the mock has to mint numbers too. Using the label as its own id made the mock
 * the one place where an id was not numeric — a facet selection round-tripped
 * here but would be rejected against the real service.
 *
 * Ids are assigned on first sight and remembered for the life of the process, so
 * a selection round-trips through {@link mockFacetLabel}. They are not stable
 * across restarts, which is fine for a fixture: the client always reads a facet
 * block before selecting from it.
 */
const mockIdByLabel = new Map<string, string>();
const mockLabelById = new Map<string, string>();

function mockFacetId(label: string): string {
  const existing = mockIdByLabel.get(label);
  if (existing) {
    return existing;
  }

  const id = String(90001 + mockIdByLabel.size);
  mockIdByLabel.set(label, id);
  mockLabelById.set(id, label);

  return id;
}

function mockFacetLabel(id: string): string | undefined {
  return mockLabelById.get(id);
}

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
    brandId: brandIdFor('Bosch'),
    brandName: 'Bosch',
    logoUrl: 'https://placehold.co/240x80/eef2ff/1e3a8a.png?text=BOSCH',
  },
  {
    brandId: brandIdFor('MANN-FILTER'),
    brandName: 'MANN-FILTER',
    logoUrl: 'https://placehold.co/240x80/fffbeb/b45309.png?text=MANN-FILTER',
  },
  {
    brandId: brandIdFor('KNECHT'),
    brandName: 'KNECHT',
    logoUrl: 'https://placehold.co/240x80/eff6ff/1d4ed8.png?text=KNECHT',
  },
  {
    brandId: brandIdFor('Ferodo'),
    brandName: 'Ferodo',
    logoUrl: 'https://placehold.co/240x80/fef2f2/991b1b.png?text=Ferodo',
  },
  {
    brandId: brandIdFor('WIX Filters'),
    brandName: 'WIX Filters',
    logoUrl: 'https://placehold.co/240x80/f0fdf4/166534.png?text=WIX+Filters',
  },
  {
    brandId: brandIdFor('Monroe'),
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
    // Deliberate collision: the same number filed by a second data supplier,
    // with its own specs and its own applicable vehicles. An article number is
    // not unique in TecDoc, and this fixture is what makes a lookup that
    // forgets the brand return visibly wrong data in dev rather than in prod.
    {
      articleNumber: 'OX 982D',
      brandName: 'Bosch',
      description: 'Oil Filter',
      thumbnailUrl: null,
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
    // Its applicable-vehicles fixture spans a dozen makes, so the section can be
    // opened at a realistic breadth in dev — see LINKED_VEHICLES_BY_ARTICLE.
    {
      articleNumber: 'TEST-MANY-VEHICLES',
      brandName: 'MockBrand',
      description: 'ТЕСТ · много приложими автомобили',
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
// mock stand-in for TecDoc getArticles searchType 3. Backs two surfaces: the
// "Заменки" tab, which lists them as parts, and the alternative-numbers section
// of a catalog row, which lists their numbers. Cross-references are mutual, so
// the oil filters point at each other; two brands per entry keep the section's
// per-brand grouping exercised in dev, and an article absent here has none.
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
  'OF-OC115': [
    {
      articleNumber: 'OX 982D',
      brandName: 'KNECHT',
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
  ],
  'OF-WL7090': [
    {
      articleNumber: 'OX 982D',
      brandName: 'KNECHT',
      description: 'Oil Filter',
      thumbnailUrl:
        'https://digitalassets.tecalliance.services/images/800/mock-oil-filter.jpg',
    },
    {
      articleNumber: 'OF-OC115',
      brandName: 'MANN-FILTER',
      description: 'Oil Filter',
      thumbnailUrl:
        'https://digitalassets.tecalliance.services/images/800/mock-oil-filter.jpg',
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
 * A fixture row. The make and series are stored alongside the vehicle because
 * TecDoc carries them on the hydration record it answers with, and the mock has
 * to be able to group and filter by them the same way — the shared DTO drops
 * both, since a rendered row always sits inside the series that owns it.
 */
interface MockLinkedVehicle extends LinkedVehicleDto {
  manufacturerName: string;
  modelSeriesName: string;
}

function linkedVehicle(
  vehicleId: string,
  manufacturerName: string,
  modelSeriesName: string,
  name: string,
  yearFrom: number,
  yearTo: number | null,
  powerKw: number,
  powerHp: number,
  fuelType: string,
  engineCodes: string[],
): MockLinkedVehicle {
  return {
    vehicleId,
    manufacturerName,
    modelSeriesName,
    name,
    yearFrom,
    yearTo,
    powerKw,
    powerHp,
    fuelType,
    engineCodes,
  };
}

/**
 * Makes for the generated breadth fixture. Twelve of them, because the
 * hand-written fixtures top out at three makes and eleven vehicles — a scale at
 * which every level of the disclosure fits on screen at once, so nothing that
 * only appears at breadth (a make list worth scrolling, counts that differ per
 * branch) is ever seen in dev.
 */
const BREADTH_MAKES = [
  'AUDI',
  'BMW',
  'CITROËN',
  'FIAT',
  'FORD',
  'MERCEDES-BENZ',
  'NISSAN',
  'OPEL',
  'PEUGEOT',
  'RENAULT',
  'SKODA',
  'VOLKSWAGEN',
];

/**
 * ~300 vehicles across those makes, deliberately uneven: a uniform grid would
 * hide a count taken from the wrong level as readily as a wrong grouping.
 */
function generateBreadthVehicles(): MockLinkedVehicle[] {
  const vehicles: MockLinkedVehicle[] = [];
  const fuelTypes = ['Diesel', 'Petrol'];

  BREADTH_MAKES.forEach((make, makeIndex) => {
    const seriesCount = 3 + (makeIndex % 3);

    for (let series = 1; series <= seriesCount; series += 1) {
      const modificationCount = 5 + ((makeIndex + series) % 5);

      for (let index = 0; index < modificationCount; index += 1) {
        const powerKw = 85 + index * 7;
        const yearFrom = 2004 + ((makeIndex + series + index) % 14);

        vehicles.push(
          linkedVehicle(
            String(700_000 + vehicles.length),
            make,
            `Series ${series}`,
            `${((14 + index) / 10).toFixed(1)} ${index % 2 === 0 ? 'TDI' : 'TSI'}`,
            yearFrom,
            index % 4 === 0 ? null : yearFrom + 6,
            powerKw,
            Math.round(powerKw * 1.36),
            fuelTypes[index % fuelTypes.length],
            [`ENG${makeIndex}${series}${index}`],
          ),
        );
      }
    }
  });

  return vehicles;
}

/**
 * Applicable vehicles per article, keyed by brand + number. Deliberately spans
 * three makes and several series: the section groups make → series →
 * modification, and a single-make fixture would leave that disclosure untested
 * in dev. `OF-WL7090` is the sparse case — one make, one series — and an
 * article absent here lists none, which is how a genuinely unlinked part
 * behaves.
 *
 * The two `OX 982D` entries are the collision pair: same number, different
 * supplier, disjoint vehicle lists. A brand-blind lookup returns one part's
 * vehicles for the other, which is exactly the bug this keying prevents.
 *
 * `TEST-MANY-VEHICLES` is the breadth case — see {@link BREADTH_MAKES}.
 */
const LINKED_VEHICLES_BY_ARTICLE: Record<string, MockLinkedVehicle[]> = {
  [articleKeyForBrandName('KNECHT', 'OX 982D')]: [
    // prettier-ignore
    linkedVehicle('20010', 'MERCEDES-BENZ', 'C-Class (W204)', 'C 220 CDI', 2007, 2014, 125, 170, 'Diesel', ['OM 651 DE22']),
    // A modification filed under several engine codes — the common case for a
    // long-running platform, and the reason the row carries a list.
    // prettier-ignore
    linkedVehicle('20011', 'MERCEDES-BENZ', 'C-Class (W204)', 'C 250 CDI', 2009, 2014, 150, 204, 'Diesel', ['OM 651 DE22', 'OM 651 DE22 LA', '651.911']),
  ],
  [articleKeyForBrandName('Bosch', 'OX 982D')]: [
    // prettier-ignore
    linkedVehicle('10001', 'VOLKSWAGEN', 'Golf VII', '2.0 TDI', 2012, 2020, 110, 150, 'Diesel', ['CRBC']),
  ],
  [articleKeyForBrandName('MANN-FILTER', 'OF-OC115')]: [
    // prettier-ignore
    linkedVehicle('10020', 'BMW', '3 Series (E90)', '320d', 2005, 2011, 130, 177, 'Diesel', ['N47 D20 C']),
    // prettier-ignore
    linkedVehicle('10021', 'BMW', '3 Series (E90)', '320d Touring', 2005, 2012, 130, 177, 'Diesel', ['N47 D20 C']),
    // prettier-ignore
    linkedVehicle('10022', 'BMW', '3 Series (E90)', '318d', 2007, 2011, 105, 143, 'Diesel', ['N47 D20 A']),
    // prettier-ignore
    linkedVehicle('10023', 'BMW', '1 Series (E87)', '120d', 2004, 2011, 130, 177, 'Diesel', ['N47 D20 C']),
    // prettier-ignore
    linkedVehicle('10024', 'BMW', '5 Series (E60)', '520d', 2005, 2010, 130, 177, 'Diesel', ['N47 D20 C']),
    // prettier-ignore
    linkedVehicle('20010', 'MERCEDES-BENZ', 'C-Class (W204)', 'C 220 CDI', 2007, 2014, 125, 170, 'Diesel', ['OM 651 DE22']),
    // prettier-ignore
    linkedVehicle('20011', 'MERCEDES-BENZ', 'C-Class (W204)', 'C 250 CDI', 2009, 2014, 150, 204, 'Diesel', ['OM 651 DE22']),
    // prettier-ignore
    linkedVehicle('20012', 'MERCEDES-BENZ', 'E-Class (W212)', 'E 220 CDI', 2009, 2016, 125, 170, 'Diesel', ['OM 651 DE22']),
    // prettier-ignore
    linkedVehicle('30010', 'VOLKSWAGEN', 'Golf VI (5K1)', '2.0 TDI', 2008, 2013, 103, 140, 'Diesel', ['CBAB']),
    // prettier-ignore
    linkedVehicle('30011', 'VOLKSWAGEN', 'Passat (B7)', '2.0 TDI', 2010, 2015, 103, 140, 'Diesel', ['CFFB']),
    // An open-ended production run, so the section renders a "2015–" span.
    // prettier-ignore
    linkedVehicle('30012', 'VOLKSWAGEN', 'Passat (B8)', '2.0 TDI', 2015, null, 110, 150, 'Diesel', ['DFCA']),
  ],
  [articleKeyForBrandName('WIX Filters', 'OF-WL7090')]: [
    // prettier-ignore
    linkedVehicle('10001', 'VOLKSWAGEN', 'Golf VII', '2.0 TDI', 2012, 2020, 110, 150, 'Diesel', ['CRBC']),
  ],
  [articleKeyForBrandName('MockBrand', 'TEST-MANY-VEHICLES')]:
    generateBreadthVehicles(),
};

/**
 * The mock's stand-in for TecDoc's article-number → `legacyArticleId` → vehicle
 * chain. Real TecDoc answers the applicable-vehicles question in several steps
 * and the service is what joins them, so the mock offers the same steps rather
 * than the finished list — otherwise mock mode would never exercise the
 * orchestration that production runs. The ids are arbitrary; only the chain
 * between them has to hold together.
 */
const LEGACY_ARTICLE_ID_BY_KEY: Record<string, number> = Object.fromEntries(
  Object.keys(LINKED_VEHICLES_BY_ARTICLE).map((key, index) => [
    key,
    900_000 + index,
  ]),
);

const LINKED_VEHICLES_BY_LEGACY_ID = new Map<number, MockLinkedVehicle[]>(
  Object.entries(LINKED_VEHICLES_BY_ARTICLE).map(([key, vehicles]) => [
    LEGACY_ARTICLE_ID_BY_KEY[key],
    vehicles,
  ]),
);

const LINKED_VEHICLE_BY_TARGET_ID = new Map<number, MockLinkedVehicle>(
  Object.values(LINKED_VEHICLES_BY_ARTICLE)
    .flat()
    .map((vehicle) => [Number(vehicle.vehicleId), vehicle]),
);

/**
 * Numeric ids for the makes and model series the fixtures name.
 *
 * The fixture rows carry names because that is what a vehicle row shows, but
 * the applicable-vehicles levels are addressed by id — the client reads a make
 * id at one level and sends it back at the next. Both maps are built eagerly
 * over the whole fixture so an id resolves whichever level is called first,
 * which a test does but a browsing visitor never would.
 */
const MAKE_ID_BY_NAME = new Map<string, number>();
const SERIES_ID_BY_NAME = new Map<string, number>();

function seriesKey(manufacturerName: string, modelSeriesName: string): string {
  return `${manufacturerName}|${modelSeriesName}`;
}

for (const vehicle of LINKED_VEHICLE_BY_TARGET_ID.values()) {
  if (!MAKE_ID_BY_NAME.has(vehicle.manufacturerName)) {
    MAKE_ID_BY_NAME.set(
      vehicle.manufacturerName,
      800_001 + MAKE_ID_BY_NAME.size,
    );
  }

  const key = seriesKey(vehicle.manufacturerName, vehicle.modelSeriesName);
  if (!SERIES_ID_BY_NAME.has(key)) {
    SERIES_ID_BY_NAME.set(key, 810_001 + SERIES_ID_BY_NAME.size);
  }
}

function makeIdOf(vehicle: MockLinkedVehicle): number {
  return MAKE_ID_BY_NAME.get(vehicle.manufacturerName) ?? 0;
}

function seriesIdOf(vehicle: MockLinkedVehicle): number {
  const key = seriesKey(vehicle.manufacturerName, vehicle.modelSeriesName);

  return SERIES_ID_BY_NAME.get(key) ?? 0;
}

/** Splits a fixture row into the vehicle and the series it hangs under. */
function hydrateMockVehicle(row: MockLinkedVehicle): LinkedVehicleWithSeries {
  return {
    seriesId: String(seriesIdOf(row)),
    seriesName: row.modelSeriesName,
    manufacturerId: String(makeIdOf(row)),
    vehicle: {
      vehicleId: row.vehicleId,
      name: row.name,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      powerKw: row.powerKw,
      powerHp: row.powerHp,
      fuelType: row.fuelType,
      engineCodes: row.engineCodes,
    },
  };
}

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

/**
 * The mock leaves `interchangeability` null throughout: TecDoc only fills it to
 * qualify a reference, so null is the common case and the fixtures should not
 * make the rarer one look normal.
 */
function oem(articleNumber: string, manufacturerName: string): OemNumberDto {
  return { articleNumber, manufacturerName, interchangeability: null };
}

/**
 * Indexes the detail fixtures by brand + number and fills each one's `brandId`
 * from its brand name, so a fixture only has to state the brand once and the
 * collision pair below can carry genuinely different data.
 */
function indexDetails(
  details: Array<Omit<ArticleCatalogDetailDto, 'brandId'>>,
): Record<string, ArticleCatalogDetailDto> {
  return Object.fromEntries(
    details.map((detail) => {
      const brandId = brandIdFor(detail.brandName);

      return [
        articleKey(brandId, detail.articleNumber),
        { ...detail, brandId },
      ];
    }),
  );
}

const ARTICLE_DETAILS: Record<string, ArticleCatalogDetailDto> = indexDetails([
  // Front/rear brake-pad pair. The "Позиция на монтаж" spec maps to the
  // fitting-position role (see ATTRIBUTE_ROLE_BY_ID) so the mock surfaces a
  // role-tagged attribute facet once the brake-pad leaf category is selected.
  {
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
    oemNumbers: [oem('1K0 698 151 B', 'VW')],
    fitsVehicle: null,
  },
  {
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
    oemNumbers: [oem('5Q0 698 451', 'VW')],
    fitsVehicle: null,
  },
  {
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
    oemNumbers: [oem('1K0 615 301 AA', 'VW'), oem('1K0 615 301 R', 'VW')],
    fitsVehicle: null,
  },
  {
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
    oemNumbers: [oem('06J 115 403 Q', 'VW'), oem('06H 115 562', 'AUDI')],
    fitsVehicle: null,
  },
  // Second aftermarket oil filter for VW OE 06J 115 403 Q. Paired with OF-OC115
  // so searching that OE number lands on the multi-result search page (both are
  // stocked in infra/db/02-mock-stock-seed.sql, so live prices render too).
  {
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
    oemNumbers: [oem('06J 115 403 Q', 'VW'), oem('06J 115 403 C', 'VW')],
    fitsVehicle: null,
  },
  // Real Knecht/Mahle OX 982D oil filter insert (Mercedes-Benz M270/M274 &
  // Infiniti). Specs sourced from the manufacturer data sheet so the data is
  // legit for testing — this part is stocked across most of our suppliers.
  {
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
      oem('A2701800009', 'MERCEDES-BENZ'),
      oem('A2701800109', 'MERCEDES-BENZ'),
      oem('A2701840025', 'MERCEDES-BENZ'),
      oem('A2701840125', 'MERCEDES-BENZ'),
      oem('2701800009', 'MERCEDES-BENZ'),
      oem('2701800109', 'MERCEDES-BENZ'),
      oem('15208HG00D', 'NISSAN'),
    ],
    fitsVehicle: null,
  },
  // The other half of the collision pair — same number, different supplier,
  // and deliberately different specs and OE numbers so a brand-blind detail
  // read is obvious on screen rather than merely wrong in the data.
  {
    articleNumber: 'OX 982D',
    brandName: 'Bosch',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: null,
    images: [],
    technicalSpecs: [
      { key: 'Filter type', value: 'Spin-on Filter' },
      { key: 'Outer Diameter', value: '76 mm' },
      { key: 'Height', value: '79 mm' },
      { key: 'Thread Size', value: 'M 20 X 1.5' },
    ],
    oemNumbers: [oem('06J 115 403 Q', 'VW')],
    fitsVehicle: null,
  },
  // Rich TecDoc details with NO stock/price data in the DB — the buy box shows
  // no price ("—") and the "Не е наличен" notice, while the page chrome (images,
  // specs, OEMs) still renders fully.
  {
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
    oemNumbers: [oem('11427508969', 'BMW'), oem('11427541827', 'BMW')],
    fitsVehicle: null,
  },
]);

const DEFAULT_ARTICLE_DETAIL: ArticleCatalogDetailDto = {
  articleNumber: '',
  brandId: '0',
  brandName: 'Unknown',
  brandLogoUrl: null,
  description: 'Auto Part',
  thumbnailUrl: null,
  images: [],
  technicalSpecs: [],
  oemNumbers: [],
  fitsVehicle: null,
};

export class TecDocMockClient {
  getManufacturers(): Promise<ManufacturerDto[]> {
    return Promise.resolve(MANUFACTURERS);
  }

  getModelSeries(manufacturerId: number): Promise<ModelSeriesDto[]> {
    return Promise.resolve(MODEL_SERIES[manufacturerId] ?? []);
  }

  getVehicleTypes(seriesId: number): Promise<VehicleVariantDto[]> {
    return Promise.resolve(VEHICLE_VARIANTS[seriesId] ?? []);
  }

  getAssemblyGroupTree(_vehicleId: number): Promise<AssemblyGroupDto[]> {
    return Promise.resolve(ASSEMBLY_GROUPS);
  }

  getBrands(): Promise<BrandDto[]> {
    return Promise.resolve(BRANDS);
  }

  /**
   * Returns the same rows the real client does, plus the linkage roles it
   * carries alongside them — mock mode has to warm the same memo, or it would
   * exercise a fallback path production rarely takes.
   */
  getArticles(
    _vehicleId: number,
    categoryId: number,
    page: number,
    pageSize: number,
  ): Promise<CatalogArticlesPage> {
    const all = ARTICLES_BY_CATEGORY[categoryId] ?? [];
    const start = (page - 1) * pageSize;
    const rows = all.slice(start, start + pageSize);

    return Promise.resolve({
      articles: {
        total: all.length,
        page,
        pageSize,
        items: rows.map((base) => this.toSummary(base)),
      },
      roles: rows.map((base) => this.linkageRolesOf(base)),
    });
  }

  searchArticles(
    query: string,
    vehicleId?: number,
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
    const categorySelected = filters?.categoryNodeId !== undefined;
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
        brandId: brandIdFor(brandName),
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
        categoryNodeId: mockFacetId(label),
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
    brandId: number,
    articleNumber: string,
    _vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    const base = ARTICLE_DETAILS[
      articleKey(String(brandId), articleNumber)
    ] ?? {
      ...DEFAULT_ARTICLE_DETAIL,
      brandId: String(brandId),
      articleNumber,
    };

    return Promise.resolve(base);
  }

  getComparableArticles(articleNumber: string): Promise<ArticleSummaryDto[]> {
    const comparable = (SUBSTITUTES_BY_ARTICLE[articleNumber] ?? []).map(
      (base) => this.toSummary(base),
    );

    return Promise.resolve(comparable);
  }

  /**
   * Unlike the real client this never reports a miss: an article number with no
   * linkage fixture simply has no vehicles, matching how the rest of the mock
   * falls back to defaults rather than 404ing on an unknown part.
   */
  getLegacyArticleIds(
    brandId: number,
    articleNumber: string,
  ): Promise<number[]> {
    const legacyArticleId =
      LEGACY_ARTICLE_ID_BY_KEY[articleKey(String(brandId), articleNumber)];

    return Promise.resolve(
      legacyArticleId === undefined ? [] : [legacyArticleId],
    );
  }

  /**
   * Every step reads the same fixture rows rather than a table of its own, so
   * the makes offered can never name one the vehicles behind them do not — the
   * way TecDoc's own manufacturer list and linkages cannot disagree either.
   */
  getLinkedManufacturers(
    legacyArticleId: number,
  ): Promise<LinkedVehicleManufacturerDto[]> {
    const byId = new Map<number, LinkedVehicleManufacturerDto>();

    for (const vehicle of LINKED_VEHICLES_BY_LEGACY_ID.get(legacyArticleId) ??
      []) {
      const manufacturerId = makeIdOf(vehicle);

      byId.set(manufacturerId, {
        manufacturerId: String(manufacturerId),
        name: vehicle.manufacturerName,
      });
    }

    return Promise.resolve([...byId.values()]);
  }

  getLinkedTargetIds(
    legacyArticleId: number,
    manufacturerId: number,
  ): Promise<number[]> {
    const vehicles = LINKED_VEHICLES_BY_LEGACY_ID.get(legacyArticleId) ?? [];

    return Promise.resolve(
      vehicles
        .filter((vehicle) => makeIdOf(vehicle) === manufacturerId)
        .map((vehicle) => Number(vehicle.vehicleId)),
    );
  }

  getVehiclesByIds(carIds: number[]): Promise<LinkedVehicleWithSeries[]> {
    const hydrated = carIds
      .map((carId) => LINKED_VEHICLE_BY_TARGET_ID.get(carId))
      .filter((vehicle): vehicle is MockLinkedVehicle => vehicle !== undefined)
      .map(hydrateMockVehicle);

    return Promise.resolve(hydrated);
  }

  /**
   * Expands a bare mock row into the shared summary shape. Specs and OE numbers
   * are borrowed from the article's detail fixture when present (mirroring how
   * the real client gets them free on the same `getArticles` response);
   * `brandLogoUrl` stays null because the brands layer joins logos from
   * getBrands, exactly as it does for the real client.
   */
  private toSummary(base: MockArticleBase): ArticleSummaryDto {
    const brandId = brandIdFor(base.brandName);
    const detail = ARTICLE_DETAILS[articleKey(brandId, base.articleNumber)];

    return {
      ...base,
      brandId,
      brandLogoUrl: null,
      technicalSpecs: detail?.technicalSpecs ?? [],
      oemNumbers: detail?.oemNumbers ?? [],
      fitsVehicle: null,
    };
  }

  private linkageRolesOf(base: MockArticleBase): ArticleLinkageRoles {
    const brandId = brandIdFor(base.brandName);
    const legacyArticleId =
      LEGACY_ARTICLE_ID_BY_KEY[articleKey(brandId, base.articleNumber)];

    return {
      brandId,
      articleNumber: base.articleNumber,
      legacyArticleIds: legacyArticleId === undefined ? [] : [legacyArticleId],
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
    const detail =
      ARTICLE_DETAILS[
        articleKey(brandIdFor(article.brandName), article.articleNumber)
      ];
    const candidateNumbers = [
      article.articleNumber,
      ...(detail?.oemNumbers ?? []).map((oemNumber) => oemNumber.articleNumber),
    ];

    return candidateNumbers.some((number) =>
      number
        .replace(/[-.\s]/g, '')
        .toUpperCase()
        .includes(normalisedQuery),
    );
  }

  /**
   * Applies the active facet selections to a mock row. Brand facets key on the
   * row's own `brandId` (a stand-in `dataSupplierId`, exactly as the real
   * client does); category-tree nodes and attribute facets have no TecDoc id in
   * the mock, so they key on minted ids for `description` and a `key:value`
   * technical-spec pair. Groups are AND-combined; a missing or empty group
   * matches everything.
   */
  private matchesFilters(
    article: ArticleSummaryDto,
    filters?: SearchFilters,
  ): boolean {
    const brandOk =
      !filters?.brandIds?.length ||
      filters.brandIds.some((brandId) => String(brandId) === article.brandId);

    const categoryOk =
      filters?.categoryNodeId === undefined ||
      mockFacetLabel(String(filters.categoryNodeId)) === article.description;

    const criteriaOk =
      !filters?.criteria?.length ||
      filters.criteria.every((selected) =>
        article.technicalSpecs.some(
          (spec) =>
            spec.key === mockFacetLabel(String(selected.criteriaId)) &&
            spec.value === selected.rawValue,
        ),
      );

    return brandOk && categoryOk && criteriaOk;
  }

  /**
   * Builds the brand facet counts over the matched set, mirroring the real
   * client's `dataSupplierFacets`: the value id is the brand id, so a selection
   * round-trips through {@link matchesFilters} and the catalog layer can join
   * the logo onto it. Logos stay null here for that layer to fill.
   */
  private buildFacets(items: ArticleSummaryDto[]): SearchFacetDto[] {
    const brandValues = this.countBy(
      items,
      (item) => item.brandId,
      (item) => ({
        id: item.brandId,
        label: item.brandName,
        count: 0,
        imageUrl: null,
      }),
    );

    return brandValues.length > 0
      ? [{ id: 'brands', label: 'Производител', values: brandValues }]
      : [];
  }

  /**
   * Builds attribute (criteria) facets from the matched set's technical specs,
   * mirroring the real client's `criteriaFacets`. Each distinct spec key becomes
   * one facet group — identified by a minted numeric criteriaId — and each
   * distinct value a selectable value, so a selection round-trips through
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
      id: mockFacetId(key),
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
   * distinct description is a root leaf under a minted numeric node id): a broad
   * search exposes them all as `options`; selecting one narrows the match set to
   * that description, so it becomes `current` with no further `options` (a leaf).
   */
  private buildCategoryNavigation(
    items: ArticleSummaryDto[],
    filters?: SearchFilters,
  ): CategoryNavigationDto {
    const selectedNodeId =
      filters?.categoryNodeId !== undefined
        ? String(filters.categoryNodeId)
        : undefined;
    const countByLabel = new Map<string, number>();

    for (const item of items) {
      countByLabel.set(
        item.description,
        (countByLabel.get(item.description) ?? 0) + 1,
      );
    }

    const nodes: CategoryOptionDto[] = [...countByLabel.entries()].map(
      ([label, count]) => ({
        id: mockFacetId(label),
        label,
        count,
        hasChildren: false,
      }),
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
    seed: (item: ArticleSummaryDto) => FacetValueDto,
  ): FacetValueDto[] {
    const byKey = new Map<string, FacetValueDto>();

    for (const item of items) {
      const key = keyOf(item);
      const value = byKey.get(key) ?? seed(item);
      value.count += 1;
      byKey.set(key, value);
    }

    return [...byKey.values()];
  }
}
