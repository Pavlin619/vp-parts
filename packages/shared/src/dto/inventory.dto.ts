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
