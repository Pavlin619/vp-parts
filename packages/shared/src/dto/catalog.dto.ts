import { StockStatus } from '../enums';
import { WarehouseAvailabilityDto } from './inventory.dto';

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

/**
 * Inventory summary shown next to a catalog article in lists/grids. The catalog
 * layer (TecDoc) owns none of this; the inventory layer adds it on top of the
 * catalog metadata below.
 */
export interface ArticleInventorySummaryDto {
  available: boolean;
  bestPriceExVat: number | null;
  bestPriceIncVat: number | null;
}

/** Catalog metadata TecDoc owns for an article in a list/grid. */
export interface ArticleCatalogListItemDto {
  articleNumber: string;
  brandName: string;
  description: string;
  thumbnailUrl: string | null;
}

/** A catalog list item enriched with its inventory summary. */
export interface ArticleListItemDto
  extends ArticleCatalogListItemDto,
    ArticleInventorySummaryDto {}

export interface PaginatedDto<TItem> {
  total: number;
  page: number;
  pageSize: number;
  items: TItem[];
}

export type PaginatedCatalogArticlesDto = PaginatedDto<ArticleCatalogListItemDto>;
export type PaginatedArticlesDto = PaginatedDto<ArticleListItemDto>;

export interface TechnicalSpecDto {
  key: string;
  value: string;
}

export interface CompatibleVehicleDto {
  vehicleId: string;
  name: string;
}

/**
 * Richer inventory data shown on the article detail page: stock status,
 * delivery estimate, and the per-warehouse availability breakdown.
 */
export interface ArticleInventoryDetailDto extends ArticleInventorySummaryDto {
  stockStatus: StockStatus;
  estimatedDeliveryDays: number | null;
  /** Available quantity per customer-facing warehouse, fastest first. */
  availabilityByWarehouse: WarehouseAvailabilityDto[];
  /**
   * Absolute instant (ISO UTC) the warehouse dates were computed, or null on
   * cached paths that omit them. Drives client-side staleness detection.
   */
  computedAt: string | null;
}

/** Catalog metadata TecDoc owns for a single article. */
export interface ArticleCatalogDetailDto {
  articleNumber: string;
  brandName: string;
  description: string;
  images: string[];
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: string[];
  compatibleVehicles: CompatibleVehicleDto[];
  fitsVehicle: boolean | null;
}

/** Catalog metadata enriched with full inventory data for the detail page. */
export interface ArticleDetailDto
  extends ArticleCatalogDetailDto,
    ArticleInventoryDetailDto {}

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
