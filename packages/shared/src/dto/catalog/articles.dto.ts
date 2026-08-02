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
 * An OE part number the article replaces, as filed by the vehicle manufacturer
 * that uses it. TecDoc lists the same number once per manufacturer, so the
 * number alone is not an identity — `manufacturerName` is what tells two
 * otherwise identical entries apart.
 */
export interface OemNumberDto {
  articleNumber: string;
  /** The vehicle manufacturer, e.g. `BMW`. Null when TecDoc files none. */
  manufacturerName: string | null;
  /**
   * How far the part interchanges with the OE one, e.g. "Interchangeable, but
   * different scope of supply". Null unless TecDoc qualifies the reference.
   */
  interchangeability: string | null;
}

/**
 * A number another parts brand sells the same article under — a cross-reference
 * into a competitor's range, as opposed to an {@link OemNumberDto}, which is a
 * vehicle manufacturer's own number.
 *
 * Unlike OE numbers these do not ride along on the catalog response: TecDoc
 * resolves them through a comparable-number search, so they are read on demand.
 */
export interface AlternativeNumberDto {
  articleNumber: string;
  /** The parts brand, e.g. `MANN-FILTER`. Always filed, unlike an OE marque. */
  brandName: string;
}

/**
 * One vehicle modification an article is confirmed to fit — a single row of the
 * applicable-vehicles table.
 *
 * Flat by design, carrying the make and model series on every row rather than
 * arriving pre-nested: the make → series → modification grouping is a
 * presentation choice, and the surfaces that render it differ in how deep they
 * nest. Every field TecDoc files as optional is nullable here, so a sparsely
 * catalogued vehicle still lists rather than being dropped.
 */
export interface LinkedVehicleDto {
  /** TecDoc linkage target id — the same id the vehicle selector resolves. */
  vehicleId: string;
  manufacturerName: string;
  modelSeriesName: string;
  /** The modification itself, e.g. `320d Touring`. */
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  powerKw: number | null;
  powerHp: number | null;
  fuelType: string | null;
  /** Engine/KBA code, e.g. `N47 D20 C`. */
  engineCode: string | null;
}

/**
 * The catalog metadata TecDoc owns for an article row. It intentionally holds
 * no live inventory so cached metadata cannot carry stale delivery data.
 */
export interface ArticleSummaryDto {
  articleNumber: string;
  /**
   * TecDoc `dataSupplierId`. An article number is not unique on its own — two
   * data suppliers can file the same one — so it is this together with
   * `articleNumber` that identifies a part. Every read that resolves one
   * specific article has to carry both.
   */
  brandId: string;
  brandName: string;
  /** Brand logo URL from TecDoc `getBrands`, or `null` when none is on file. */
  brandLogoUrl: string | null;
  description: string;
  thumbnailUrl: string | null;
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: OemNumberDto[];
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
