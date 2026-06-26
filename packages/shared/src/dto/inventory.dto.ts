import { StockStatus } from '../enums';

/**
 * How much stock can be delivered within one delivery window (e.g. how much can
 * arrive today vs in 2 days). Client-safe: no supplier buy prices. The frontend
 * renders a per-delivery-date availability breakdown from a list of these.
 */
export interface DeliveryAvailabilityDto {
  stockStatus: StockStatus;
  estimatedDeliveryDays: number;
  quantity: number;
}

export interface AvailabilityDto {
  articleNumber: string;
  available: boolean;
  stockStatus: StockStatus;
  estimatedDeliveryDays: number | null;
  quantity: number;
  priceExVat: number | null;
  priceIncVat: number | null;
  /** Available quantity per delivery window, fastest first. */
  availabilityByDelivery: DeliveryAvailabilityDto[];
}
