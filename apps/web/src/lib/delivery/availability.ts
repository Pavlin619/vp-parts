import {
  MAX_CART_LINE_QUANTITY,
  selectWarehouseForQuantity,
  type ArticlesAvailabilityDto,
  type WarehouseAvailabilityDto,
  type WarehouseId,
} from "@vp-parts-shop/shared";

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
 * logic from. Both rules live in the shared contract because the API applies
 * them too: it orders parts by the band, and dates a parcel by the warehouse.
 */
export {
  deliveryBand,
  selectWarehouseForQuantity,
  type DeliveryBand,
} from "@vp-parts-shop/shared";

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

/**
 * Absolute ceiling for any quantity stepper, regardless of stock. Owned by the
 * shared contract because the server clamps a cart line to the same number.
 */
export const MAX_QUANTITY = MAX_CART_LINE_QUANTITY;

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
 * Every order cut-off in a batch availability read, de-duplicated and in
 * chronological order — what a surface schedules its re-validation against.
 *
 * De-duplicated because a page of fifty articles carries the same handful of
 * warehouse deadlines fifty times over, and the caller keys an effect on this.
 */
export function collectCutoffAts(
  availability: ArticlesAvailabilityDto | null | undefined,
): string[] {
  if (!availability) {
    return [];
  }

  const cutoffAts = Object.values(availability).flatMap((detail) =>
    detail.availabilityByWarehouse.map((warehouse) => warehouse.cutoffAt),
  );

  // ISO UTC instants sort chronologically as strings, and sorting makes the
  // list canonical so a reordered read does not read as a changed one.
  return [...new Set(cutoffAts)].sort();
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
