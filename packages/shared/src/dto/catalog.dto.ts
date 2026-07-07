import { WarehouseAvailabilityDto } from './inventory.dto';

export interface ManufacturerDto {
  id: string;
  name: string;
}

/**
 * A parts brand (TecDoc data supplier) with its logo. The logo comes from the
 * TecDoc `getBrands` function (`dataSupplierLogo.imageURL*`); it is `null` when
 * TecDoc has no logo on file for that brand.
 */
export interface BrandDto {
  brandName: string;
  logoUrl: string | null;
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

/**
 * A catalog list item enriched with the *full* live inventory detail — price,
 * availability, and the per-warehouse breakdown — so every list surface (grid,
 * search, substitutes) can feed the same row component. Because it carries
 * request-time warehouse delivery dates it must only come from **dynamic
 * (uncached)** responses; cached listings serve the metadata-only
 * `ArticleCatalogListItemDto` and fetch this availability live and separately
 * (see the article detail page's cached-metadata / live-availability split).
 */
export interface ArticleListItemDto
  extends ArticleCatalogListItemDto,
    ArticleInventoryDetailDto {}

export interface PaginatedDto<TItem> {
  total: number;
  page: number;
  pageSize: number;
  items: TItem[];
}

export type PaginatedCatalogArticlesDto = PaginatedDto<ArticleCatalogListItemDto>;
export type PaginatedArticlesDto = PaginatedDto<ArticleListItemDto>;

/**
 * Live price/availability for a batch of articles, keyed by article number.
 * Returned by the uncached bulk-availability endpoint that a cached listing
 * grid calls to hydrate its metadata rows with fresh delivery/stock data. A
 * requested number is absent from the map only when it has no inventory row.
 */
export type ArticlesAvailabilityDto = Record<string, ArticleInventoryDetailDto>;

export interface TechnicalSpecDto {
  key: string;
  value: string;
}

export interface CompatibleVehicleDto {
  vehicleId: string;
  name: string;
}

/**
 * Richer inventory data shown on the article detail page: the per-warehouse
 * availability breakdown, which carries the delivery projection the UI renders.
 */
export interface ArticleInventoryDetailDto extends ArticleInventorySummaryDto {
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
  /** Brand logo URL from TecDoc `getBrands`, or `null` when none is on file. */
  brandLogoUrl: string | null;
  description: string;
  images: string[];
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: string[];
  compatibleVehicles: CompatibleVehicleDto[];
  fitsVehicle: boolean | null;
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
