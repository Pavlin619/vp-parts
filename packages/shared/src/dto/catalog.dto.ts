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

/**
 * The single catalog metadata shape TecDoc owns for an article row, shared by
 * every list surface — category listing, search, and substitutes — and extended
 * by the article detail DTO. It carries identity, brand (+ logo), description,
 * thumbnail, and the technical specs / OE numbers that ride along free on the
 * same `getArticles` (`includeAll`) response, plus the vehicle-fit flag. It
 * holds **no** live inventory: every surface fetches price/availability
 * separately and merges it in, so cached metadata never carries a stale
 * delivery date. Compatible vehicles are intentionally excluded here — they
 * require a separate per-article TecDoc lookup and live on the detail DTO.
 */
export interface ArticleSummaryDto {
  articleNumber: string;
  brandName: string;
  /** Brand logo URL from TecDoc `getBrands`, or `null` when none is on file. */
  brandLogoUrl: string | null;
  description: string;
  thumbnailUrl: string | null;
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: string[];
  /** `true`/`false` when a vehicle is scoped for the request, else `null`. */
  fitsVehicle: boolean | null;
}

/**
 * A catalog summary enriched with the *full* live inventory detail — price,
 * availability, and the per-warehouse breakdown — so every list surface (grid,
 * search, substitutes) can feed the same row component. Because it carries
 * request-time warehouse delivery dates it must only come from **dynamic
 * (uncached)** responses; cached listings serve the metadata-only
 * `ArticleSummaryDto` and fetch this availability live and separately (see the
 * article detail page's cached-metadata / live-availability split).
 */
export interface ArticleListItemDto
  extends ArticleSummaryDto,
    ArticleInventoryDetailDto {}

export interface PaginatedDto<TItem> {
  total: number;
  page: number;
  pageSize: number;
  items: TItem[];
}

export type PaginatedCatalogArticlesDto = PaginatedDto<ArticleSummaryDto>;
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

/**
 * Catalog metadata TecDoc owns for a single article — the shared
 * {@link ArticleSummaryDto} plus the detail-only image gallery and the
 * compatible-vehicle list (populated by a separate per-article TecDoc lookup;
 * empty until that fitment feature lands).
 */
export interface ArticleCatalogDetailDto extends ArticleSummaryDto {
  images: string[];
  compatibleVehicles: CompatibleVehicleDto[];
}

export interface SearchResponseDto {
  redirect?: string;
  query?: string;
  normalisedQuery?: string;
  /**
   * Search hits as cacheable {@link ArticleSummaryDto} metadata (identity,
   * brand, specs/OE, thumbnail, and fit) with **no** live inventory. Mirrors
   * the listing grid / article detail split: the client fetches live
   * price/availability separately via {@link ArticlesAvailabilityDto} and
   * merges it in.
   */
  results?: ArticleSummaryDto[];
  suggestions?: AutocompleteItemDto[];
}

export interface AutocompleteItemDto {
  articleNumber: string;
  brandName: string;
  description: string;
}
