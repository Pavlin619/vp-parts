import type { WarehouseRow } from "./availability";
import {
  combineDeliveryPromises,
  warehousePromise,
  type DeliveryPromise,
} from "./promise";

function warehouse(overrides: Partial<WarehouseRow> = {}): WarehouseRow {
  return {
    warehouseId: "REGIONAL_1",
    name: "Регионален склад 1",
    quantity: 5,
    deliveryWorkDays: 1,
    orderCutoffTime: "18:00",
    cutoffAt: "2026-07-01T15:00:00.000Z",
    pickup: { earliestAt: "2026-07-02T06:00:00.000Z", granularity: "DAY" },
    courier: { earliestAt: "2026-07-03T06:00:00.000Z", granularity: "DAY" },
    ...overrides,
  };
}

function promise(overrides: Partial<DeliveryPromise> = {}): DeliveryPromise {
  return {
    cutoffAt: "2026-07-01T15:00:00.000Z",
    orderCutoffTime: "18:00",
    warehouseName: "Регионален склад 1",
    fulfilledAt: "2026-07-02T06:00:00.000Z",
    isPickup: true,
    ...overrides,
  };
}

describe("warehousePromise", () => {
  it("promises the pickup projection when collecting from the shop", () => {
    const result = warehousePromise(warehouse(), "pickup");

    expect(result).toEqual({
      cutoffAt: "2026-07-01T15:00:00.000Z",
      orderCutoffTime: "18:00",
      warehouseName: "Регионален склад 1",
      fulfilledAt: "2026-07-02T06:00:00.000Z",
      isPickup: true,
    });
  });

  it("promises the courier projection when delivering to an address", () => {
    const result = warehousePromise(warehouse(), "courier");

    expect(result.fulfilledAt).toBe("2026-07-03T06:00:00.000Z");
    expect(result.isPickup).toBe(false);
  });
});

describe("combineDeliveryPromises", () => {
  // The order ships as one consignment: every line has to be picked before its
  // own warehouse closes, so the earliest deadline is the one that binds.
  it("binds the order to the earliest cut-off", () => {
    const result = combineDeliveryPromises([
      promise({
        cutoffAt: "2026-07-01T15:00:00.000Z",
        orderCutoffTime: "18:00",
        warehouseName: "Регионален склад 1",
      }),
      promise({
        cutoffAt: "2026-07-01T11:00:00.000Z",
        orderCutoffTime: "14:00",
        warehouseName: "Централен склад",
      }),
    ]);

    expect(result?.cutoffAt).toBe("2026-07-01T11:00:00.000Z");
    expect(result?.orderCutoffTime).toBe("14:00");
    expect(result?.warehouseName).toBe("Централен склад");
  });

  // The order is only complete once its slowest line is.
  it("promises the date of the slowest line", () => {
    const result = combineDeliveryPromises([
      promise({ fulfilledAt: "2026-07-02T06:00:00.000Z" }),
      promise({ fulfilledAt: "2026-07-06T06:00:00.000Z" }),
      promise({ fulfilledAt: "2026-07-03T06:00:00.000Z" }),
    ]);

    expect(result?.fulfilledAt).toBe("2026-07-06T06:00:00.000Z");
  });

  it("takes both halves from different lines when they disagree", () => {
    const result = combineDeliveryPromises([
      promise({
        cutoffAt: "2026-07-01T09:00:00.000Z",
        orderCutoffTime: "12:00",
        fulfilledAt: "2026-07-02T06:00:00.000Z",
      }),
      promise({
        cutoffAt: "2026-07-01T15:00:00.000Z",
        orderCutoffTime: "18:00",
        fulfilledAt: "2026-07-07T06:00:00.000Z",
      }),
    ]);

    expect(result?.orderCutoffTime).toBe("12:00");
    expect(result?.fulfilledAt).toBe("2026-07-07T06:00:00.000Z");
  });

  it("has nothing to promise for an empty order", () => {
    expect(combineDeliveryPromises([])).toBeNull();
  });
});
