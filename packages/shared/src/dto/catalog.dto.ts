export interface ManufacturerDto {
  id: string;
  name: string;
}

export interface ModelSeriesDto {
  id: string;
  manufacturerId: string;
  name: string;
}

export interface VehicleVariantDto {
  vehicleId: string;
  seriesId: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
  engine: string;
  powerKw: number;
  fuelType: string;
  bodyType: string;
}

export interface AssemblyGroupDto {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ArticleListItemDto {
  articleNumber: string;
  brandName: string;
  description: string;
  thumbnailUrl: string | null;
  available: boolean;
  bestPriceExVat: number | null;
  bestPriceIncVat: number | null;
}

export interface PaginatedArticlesDto {
  total: number;
  page: number;
  pageSize: number;
  items: ArticleListItemDto[];
}

export interface TechnicalSpecDto {
  key: string;
  value: string;
}

export interface CompatibleVehicleDto {
  vehicleId: string;
  name: string;
}

export interface ArticleDetailDto {
  articleNumber: string;
  brandName: string;
  description: string;
  images: string[];
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: string[];
  compatibleVehicles: CompatibleVehicleDto[];
  fitsVehicle: boolean | null;
  available: boolean;
  stockStatus: string;
  estimatedDeliveryDays: number | null;
  bestPriceExVat: number | null;
  bestPriceIncVat: number | null;
  tradePriceExVat?: number;
  tradePriceIncVat?: number;
}

export interface SearchResultItemDto {
  articleNumber: string;
  brandName: string;
  description: string;
  available: boolean;
  bestPriceIncVat: number | null;
  fitsVehicle: boolean | null;
}

export interface SearchResponseDto {
  redirect?: string;
  query?: string;
  normalisedQuery?: string;
  results?: SearchResultItemDto[];
  suggestions?: AutocompleteItemDto[];
}

export interface AutocompleteItemDto {
  articleNumber: string;
  brandName: string;
  description: string;
}
