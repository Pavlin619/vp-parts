import type { ArticleInventoryDetailDto } from '../inventory.dto';
import type { PaginatedDto } from '../common.dto';

export interface TechnicalSpecDto {
  key: string;
  value: string;
}

export interface CompatibleVehicleDto {
  vehicleId: string;
  name: string;
}

/**
 * The catalog metadata TecDoc owns for an article row. It intentionally holds
 * no live inventory so cached metadata cannot carry stale delivery data.
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
 * A catalog summary enriched with live inventory for dynamic list surfaces.
 */
export interface ArticleListItemDto
  extends ArticleSummaryDto,
    ArticleInventoryDetailDto {}

export type PaginatedCatalogArticlesDto = PaginatedDto<ArticleSummaryDto>;
export type PaginatedArticlesDto = PaginatedDto<ArticleListItemDto>;

/**
 * Catalog metadata TecDoc owns for a single article.
 */
export interface ArticleCatalogDetailDto extends ArticleSummaryDto {
  images: string[];
  compatibleVehicles: CompatibleVehicleDto[];
}
