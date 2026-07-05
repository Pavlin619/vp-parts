import type { WarehouseAvailabilityDto, WarehouseId } from "@vp-parts-shop/shared";

/**
 * Customer-facing warehouse names. The backend already groups supplier stock
 * into these fictional warehouses (fastest-first) and projects the delivery
 * dates; the frontend only maps the id to a Bulgarian label and presents it.
 */
export const WAREHOUSE_NAMES: Record<WarehouseId, string> = {
  CENTRAL: "Централен склад",
  REGIONAL_1: "Регионален склад 1",
  REGIONAL_2: "Регионален склад 2",
  ROMANIA: "Склад Румъния",
  POLAND: "Склад Полша",
};

export interface WarehouseRow extends WarehouseAvailabilityDto {
  name: string;
}

/**
 * How fast a warehouse can fulfil, as a customer-facing speed band. Drives the
 * availability dot colour (green → blue → yellow → orange) so the tone reflects
 * the delivery promise rather than which warehouse holds the stock.
 */
export type DeliveryBand = "within-hour" | "today" | "day1" | "day2" | "day3";

/**
 * Derives the speed band from the warehouse's pickup projection. The central
 * warehouse is our own in-stock stock — always the green "available" band, even
 * after the same-day cut-off rolls its pickup from a within-the-hour clock
 * promise to a dated one. A within-the-hour promise is likewise the fastest
 * band; otherwise the nominal working-day term (0 = today, then 1/2/3) selects
 * the band, clamped so anything slower than three days reads as the orange band.
 */
export function deliveryBand(warehouse: WarehouseAvailabilityDto): DeliveryBand {
  if (warehouse.warehouseId === "CENTRAL" || warehouse.pickup.granularity === "HOUR") {
    return "within-hour";
  }

  if (warehouse.deliveryWorkDays <= 0) {
    return "today";
  }
  if (warehouse.deliveryWorkDays === 1) {
    return "day1";
  }
  if (warehouse.deliveryWorkDays === 2) {
    return "day2";
  }

  return "day3";
}

export interface AvailabilitySummary {
  /** Total available across every warehouse. */
  totalQuantity: number;
  /** Warehouses holding stock, fastest-first — drives the breakdown popover. */
  warehouses: WarehouseRow[];
}

/**
 * Decorates the backend warehouse rows with display names and rolls up the
 * total count. Pure so it can be unit tested without rendering. Empty
 * warehouses are dropped; the fastest-first order from the backend is kept.
 */
export function summariseWarehouses(
  availabilityByWarehouse: WarehouseAvailabilityDto[],
): AvailabilitySummary {
  const warehouses = availabilityByWarehouse
    .filter((warehouse) => warehouse.quantity > 0)
    .map((warehouse) => ({
      ...warehouse,
      name: WAREHOUSE_NAMES[warehouse.warehouseId],
    }));

  const totalQuantity = availabilityByWarehouse.reduce(
    (sum, warehouse) => sum + warehouse.quantity,
    0,
  );

  return { totalQuantity, warehouses };
}

/**
 * Picks the single warehouse that fulfils the requested quantity. Walking the
 * fastest-first rows and accumulating stock means the promise for the whole line
 * is the slowest band we have to reach — so a customer asking for more than the
 * central warehouse holds sees the slower (but truthful) date.
 *
 * Falls back to the slowest warehouse when total stock is insufficient, so the
 * UI always shows the best-case date for the part rather than nothing.
 */
export function selectWarehouseForQuantity(
  availabilityByWarehouse: WarehouseAvailabilityDto[],
  quantity: number,
): WarehouseAvailabilityDto | null {
  const stocked = availabilityByWarehouse.filter((warehouse) => warehouse.quantity > 0);
  if (stocked.length === 0) {
    return null;
  }

  let cumulative = 0;
  for (const warehouse of stocked) {
    cumulative += warehouse.quantity;
    if (cumulative >= quantity) {
      return warehouse;
    }
  }

  return stocked[stocked.length - 1];
}

/**
 * Whether a warehouse's projected date can no longer be trusted because the wall
 * clock has moved on since the snapshot was computed. Two cases:
 *  - a within-the-hour clock promise whose moment has already elapsed;
 *  - an order cut-off that was still ahead when we computed but has since passed
 *    (so the delivery band would now shift to a later day).
 * The detail page re-validates on this signal instead of showing a wrong date.
 */
export function isWarehouseSnapshotStale(
  warehouse: WarehouseAvailabilityDto,
  computedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const nowMs = now.getTime();

  if (
    warehouse.pickup.granularity === "HOUR" &&
    new Date(warehouse.pickup.earliestAt).getTime() <= nowMs
  ) {
    return true;
  }

  if (computedAt) {
    const cutoffMs = new Date(warehouse.cutoffAt).getTime();
    if (cutoffMs > new Date(computedAt).getTime() && cutoffMs <= nowMs) {
      return true;
    }
  }

  return false;
}
