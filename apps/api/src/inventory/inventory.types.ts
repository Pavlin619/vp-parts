import { DeliveryAvailabilityDto, StockStatus } from '@vp-parts-shop/shared';

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
  stockStatus: StockStatus;
  estimatedDeliveryDays: number | null;
  quantity: number;
  /** Available quantity per delivery window, fastest first. */
  availabilityByDelivery: DeliveryAvailabilityDto[];
}
