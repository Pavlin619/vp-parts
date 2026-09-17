import { resolveLineFulfilment } from "@/lib/delivery/availability";
import {
  combineDeliveryPromises,
  warehousePromise,
  type DeliveryPromise,
} from "@/lib/delivery/promise";
import type { CartRowModel } from "./cart-totals";

/**
 * The deadline a whole basket is racing, or null when we cannot promise one.
 *
 * It covers exactly the lines the summary's money covers — the orderable ones —
 * and quotes a pickup date, because the cart is the step before a delivery
 * method is chosen.
 *
 * A line we hold no warehouse breakdown for (the read is still in flight, or it
 * came back in stock without one) makes the whole basket unpromisable: a
 * deadline that quietly leaves a line out is one the order cannot meet.
 */
export function resolveOrderPromise(
  rows: CartRowModel[],
): DeliveryPromise | null {
  const orderable = rows.filter((row) => row.issue === null);

  const promises: DeliveryPromise[] = [];
  for (const row of orderable) {
    const { warehouse } = resolveLineFulfilment(
      row.availability?.availabilityByWarehouse ?? [],
      row.line.quantity,
    );

    if (!warehouse) {
      return null;
    }

    promises.push(warehousePromise(warehouse, "pickup"));
  }

  return combineDeliveryPromises(promises);
}
