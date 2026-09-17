import type { WarehouseRow } from "./availability";

/** Which projection a promise quotes — collection from the shop, or delivery. */
export type Fulfilment = "pickup" | "courier";

/**
 * A deadline the customer is racing and what meeting it buys.
 *
 * One line in the buy box or a whole basket in the cart both reduce to this, so
 * the two surfaces can never describe the same deadline differently.
 */
export interface DeliveryPromise {
  /** Absolute instant of the binding order cut-off (ISO UTC). */
  cutoffAt: string;
  /** The customer-facing cut-off clock, e.g. "18:00". */
  orderCutoffTime: string;
  /** The warehouse whose cut-off binds — the one being raced. */
  warehouseName: string;
  /** When the order is with the customer if the deadline is met (ISO UTC). */
  fulfilledAt: string;
  /** Whether that moment is a collection from the shop rather than a delivery. */
  isPickup: boolean;
}

/** What one warehouse promises for one fulfilment method. */
export function warehousePromise(
  warehouse: WarehouseRow,
  fulfilment: Fulfilment,
): DeliveryPromise {
  const isPickup = fulfilment === "pickup";

  return {
    cutoffAt: warehouse.cutoffAt,
    orderCutoffTime: warehouse.orderCutoffTime,
    warehouseName: warehouse.name,
    fulfilledAt: (isPickup ? warehouse.pickup : warehouse.courier).earliestAt,
    isPickup,
  };
}

/**
 * The single promise a multi-line order can be held to.
 *
 * Its two halves come from different lines. The order ships as one consignment,
 * so every line has to be picked before its own warehouse closes — the earliest
 * cut-off binds — while the order is only complete once its slowest line is, so
 * that is the date it can be promised for.
 *
 * Instants are compared as strings: they arrive as fixed-width ISO UTC, which
 * sorts chronologically.
 */
export function combineDeliveryPromises(
  promises: DeliveryPromise[],
): DeliveryPromise | null {
  if (promises.length === 0) {
    return null;
  }

  const binding = promises.reduce((earliest, promise) =>
    promise.cutoffAt < earliest.cutoffAt ? promise : earliest,
  );

  const slowest = promises.reduce((latest, promise) =>
    promise.fulfilledAt > latest.fulfilledAt ? promise : latest,
  );

  return { ...binding, fulfilledAt: slowest.fulfilledAt };
}
