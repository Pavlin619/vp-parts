/**
 * Customer-facing fictional warehouse identifiers. We never expose the real
 * suppliers; supplier stock is grouped into these warehouses by inherent
 * delivery capability. Ordered fastest-first.
 */
export type WarehouseId =
  | 'CENTRAL'
  | 'REGIONAL_1'
  | 'REGIONAL_2'
  | 'ROMANIA'
  | 'POLAND';

export type DeliveryGranularity = 'HOUR' | 'DAY';

/**
 * A projected delivery moment for one fulfilment option. `earliestAt` is an
 * absolute ISO instant (UTC); the frontend formats it in the shop timezone.
 * `granularity` tells the UI whether to show a clock time ("за 11:12", HOUR) or
 * just a date ("до 1 работен ден", DAY).
 */
export interface DeliveryProjectionDto {
  earliestAt: string;
  granularity: DeliveryGranularity;
}

/**
 * United availability for one customer-facing warehouse, with the order cut-off
 * and the projected pickup/courier delivery dates already computed server-side.
 */
export interface WarehouseAvailabilityDto {
  warehouseId: WarehouseId;
  quantity: number;
  /** Nominal delivery term in working days (0/0/1/2/3). */
  deliveryWorkDays: number;
  /** The order cut-off shown to the customer, e.g. "17:00". */
  orderCutoffTime: string;
  /**
   * Absolute instant (ISO UTC) of the order cut-off that applies to this
   * snapshot. Lets the frontend detect when the wall clock has crossed the
   * cut-off (so the shown date is now stale) and schedule a re-validation.
   */
  cutoffAt: string;
  pickup: DeliveryProjectionDto;
  courier: DeliveryProjectionDto;
}

/**
 * Inventory summary shown next to a catalog article in lists/grids.
 */
export interface ArticleInventorySummaryDto {
  available: boolean;
  bestPriceExVat: number | null;
  bestPriceIncVat: number | null;
}

/**
 * Richer inventory data with the per-warehouse availability breakdown.
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
 * The two halves that identify a TecDoc article. A number is unique only within
 * a data supplier, so no inventory read takes one without the other.
 */
export interface ArticleIdentityDto {
  /** TecDoc `dataSupplierId` — the brand. */
  brandId: string;
  articleNumber: string;
}

/**
 * The string form of an article's identity, used as a map key on both sides of
 * the wire and as the token the availability endpoint accepts.
 *
 * Brand first so the split is unambiguous: a brand id is digits only, so the
 * first colon always separates the halves even when the number contains one.
 */
export function articleIdentityKey(
  brandId: string | number,
  articleNumber: string,
): string {
  return `${brandId}:${articleNumber}`;
}

/**
 * Live price/availability for a batch of articles, keyed by
 * {@link articleIdentityKey}. A requested article is absent only when it has no
 * inventory row.
 */
export type ArticlesAvailabilityDto = Record<string, ArticleInventoryDetailDto>;
