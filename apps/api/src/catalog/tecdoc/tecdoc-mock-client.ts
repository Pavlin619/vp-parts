import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedArticlesDto,
  ArticleDetailDto,
} from '@vp-parts-shop/shared';

// TODO: delete this class ones we have finished the contract with TECDOC

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

const ARTICLES_BY_CATEGORY: Record<
  string,
  Array<{
    articleNumber: string;
    brandName: string;
    description: string;
    thumbnailUrl: string | null;
  }>
> = {
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

const ARTICLE_DETAILS: Record<
  string,
  Omit<
    ArticleDetailDto,
    | 'available'
    | 'stockStatus'
    | 'estimatedDeliveryDays'
    | 'bestPriceExVat'
    | 'bestPriceIncVat'
  >
> = {
  'BD-0986478451': {
    articleNumber: 'BD-0986478451',
    brandName: 'Bosch',
    description: 'Brake Disc',
    images: [
      'https://digitalassets.tecalliance.services/images/800/mock-brake-disc.jpg',
    ],
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
    description: 'Oil Filter',
    images: [
      'https://digitalassets.tecalliance.services/images/800/mock-oil-filter.jpg',
    ],
    technicalSpecs: [
      { key: 'Height', value: '89 mm' },
      { key: 'Outer Diameter 1', value: '76 mm' },
      { key: 'Thread Size', value: 'M 20 X 1.5' },
    ],
    oemNumbers: ['06J 115 403 Q', '06H 115 562'],
    compatibleVehicles: [],
    fitsVehicle: null,
  },
};

const DEFAULT_ARTICLE_DETAIL: Omit<
  ArticleDetailDto,
  | 'available'
  | 'stockStatus'
  | 'estimatedDeliveryDays'
  | 'bestPriceExVat'
  | 'bestPriceIncVat'
> = {
  articleNumber: '',
  brandName: 'Unknown',
  description: 'Auto Part',
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

  getArticles(
    _vehicleId: string,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedArticlesDto> {
    const all = ARTICLES_BY_CATEGORY[categoryId] ?? [];
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize).map((a) => ({
      ...a,
      available: false,
      bestPriceExVat: null,
      bestPriceIncVat: null,
    }));

    return Promise.resolve({ total: all.length, page, pageSize, items });
  }

  getArticleDetails(
    articleNumber: string,
    _vehicleId?: string,
  ): Promise<ArticleDetailDto> {
    const base = ARTICLE_DETAILS[articleNumber] ?? {
      ...DEFAULT_ARTICLE_DETAIL,
      articleNumber,
    };

    return Promise.resolve({
      ...base,
      available: false,
      stockStatus: 'UNKNOWN',
      estimatedDeliveryDays: null,
      bestPriceExVat: null,
      bestPriceIncVat: null,
    });
  }
}
