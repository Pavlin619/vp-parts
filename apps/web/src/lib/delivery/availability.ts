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
 * Re-exported so this module stays the one place the frontend reads warehouse
 * logic from. The band rule itself lives in the shared contract because the API
 * orders parts by the same band the dot colour comes from.
 */
export { deliveryBand, type DeliveryBand } from "@vp-parts-shop/shared";

/**
 * Deepest stock we name exactly. Anything above reads "9+": how many hundreds
 * we hold is not something a buyer decides on, and it is not worth publishing.
 * A display rule only — the stepper ceiling and the delivery projection both
 * keep working from the real quantity.
 */
export const STOCK_DISPLAY_LIMIT = 9;

export function isStockCapped(quantity: number): boolean {
  return quantity > STOCK_DISPLAY_LIMIT;
}

/** Absolute ceiling for any quantity stepper, regardless of stock. */
export const MAX_QUANTITY = 99;

export function formatStockQuantity(quantity: number): string {
  return isStockCapped(quantity) ? `${STOCK_DISPLAY_LIMIT}+` : String(quantity);
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
 * Highest quantity the given stock allows, capped at {@link MAX_QUANTITY}. An
 * empty breakdown means we cannot know the stock, so the ceiling falls back to
 * the absolute UI maximum — callers holding an `available: false` read must
 * answer that case themselves rather than pass the empty list here.
 */
export function stockCeiling(
  availabilityByWarehouse: WarehouseAvailabilityDto[],
): number {
  const { totalQuantity } = summariseWarehouses(availabilityByWarehouse);

  return totalQuantity > 0 ? Math.min(totalQuantity, MAX_QUANTITY) : MAX_QUANTITY;
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
export function selectWarehouseForQuantity<T extends WarehouseAvailabilityDto>(
  availabilityByWarehouse: T[],
  quantity: number,
): T | null {
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

/** What a line's live inventory means for the quantity actually being ordered. */
export interface LineFulfilment {
  /** Every stocked warehouse, fastest-first — the breakdown dialog's rows. */
  warehouses: WarehouseRow[];
  /** Stock across every warehouse. */
  totalQuantity: number;
  /**
   * The single warehouse the whole line would ship from, and so the one whose
   * band is the line's delivery promise. Null when nothing is stocked.
   */
  warehouse: WarehouseRow | null;
}

/**
 * Everything a row needs to describe one line of `quantity` pieces.
 *
 * The single place the quantity-aware rule from `docs/DELIVERY-LOGIC.md` is
 * applied: a line ships as one parcel, so its promise is the slowest band the
 * order has to reach, never the fastest warehouse's. A surface that reads the
 * warehouse breakdown itself quotes a speed for a quantity it cannot ship.
 */
export function resolveLineFulfilment(
  availabilityByWarehouse: WarehouseAvailabilityDto[],
  quantity: number,
): LineFulfilment {
  const { warehouses, totalQuantity } = summariseWarehouses(availabilityByWarehouse);

  return {
    warehouses,
    totalQuantity,
    warehouse: selectWarehouseForQuantity(warehouses, quantity),
  };
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
