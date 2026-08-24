import type { ArticleInventoryDetailDto } from '../inventory.dto';
import type { PaginatedDto } from '../common.dto';

export interface TechnicalSpecDto {
  key: string;
  value: string;
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
 * A number another parts brand sells the equivalent article under — a
 * cross-reference into a competitor's range, as opposed to an
 * {@link OemNumberDto}, which is a vehicle manufacturer's own number.
 *
 * Unlike OE numbers these do not ride along on the catalog response: they are
 * the numbers of the parts found by searching the article's OE numbers, so they
 * are read on demand.
 */
export interface AlternativeNumberDto {
  articleNumber: string;
  /** The parts brand, e.g. `MANN-FILTER`. Always filed, unlike an OE marque. */
  brandName: string;
}

/**
 * One make in the applicable-vehicles section — the top level of the
 * disclosure, and the only one read when the section opens.
 *
 * No count rides along. TecDoc answers "which makes does this part fit" with
 * names alone (`getArticleLinkedAllLinkingTargetManufacturer2`), and the only
 * way to number them would be to hydrate every vehicle of every make before a
 * visitor has asked for any of them.
 */
export interface LinkedVehicleManufacturerDto {
  /** TecDoc `manuId` — the same id the vehicle selector resolves. */
  manufacturerId: string;
  name: string;
}

/**
 * One model series of a make, with the modifications under it. Opening a make
 * answers with its whole tree, so a series carries its vehicles rather than a
 * count — the two can then never disagree.
 */
export interface LinkedVehicleSeriesDto {
  /** TecDoc `modId`. */
  seriesId: string;
  manufacturerId: string;
  name: string;
  vehicles: LinkedVehicleDto[];
}

/**
 * One vehicle modification an article is confirmed to fit — a single row of the
 * applicable-vehicles table.
 *
 * Neither make nor series is repeated here: a row only ever renders inside the
 * {@link LinkedVehicleSeriesDto} that owns it, and a make can hold several
 * hundred rows. Every field TecDoc files as optional is nullable, so a sparsely
 * catalogued vehicle still lists rather than being dropped.
 */
export interface LinkedVehicleDto {
  /** TecDoc `carId`, which is the linkage target id under another name. */
  vehicleId: string;
  /** The modification itself, e.g. `320d Touring`. */
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  powerKw: number | null;
  powerHp: number | null;
  fuelType: string | null;
  /**
   * Every engine code filed for the modification, e.g. `['N47 D20 C']`. A plural
   * because one modification genuinely carries several, and a mechanic checking
   * the code stamped on the block against a single one of them would conclude
   * the part does not fit. Empty when TecDoc files none.
   */
  engineCodes: string[];
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
 *
 * The vehicles it fits are not part of this: that list runs to thousands of
 * modifications for a common service part and costs three further TecDoc reads,
 * so the applicable-vehicles section fetches it per make on demand through
 * `/catalog/brands/:brandId/articles/:articleNumber/linked-vehicles`.
 */
export interface ArticleCatalogDetailDto extends ArticleSummaryDto {
  images: string[];
}
