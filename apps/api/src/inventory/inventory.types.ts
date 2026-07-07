import { WarehouseAvailabilityDto } from '@vp-parts-shop/shared';

/**
 * Resolved price & availability for a single article, as consumed by the public
 * catalog (listing + detail) enrichment. Monetary values are integer EUR cents,
 * or null when the article is unavailable. This is the cross-module contract
 * `CatalogService` reads from `InventoryService`.
 */
export interface PriceAndAvailability {
  available: boolean;
  priceExVat: number | null;
  priceIncVat: number | null;
  /** Available quantity per customer-facing warehouse, fastest first. */
  availabilityByWarehouse: WarehouseAvailabilityDto[];
  /** When the warehouse dates were computed (ISO UTC), or null if omitted. */
  computedAt: string | null;
}
