import type { WarehouseAvailabilityDto, WarehouseId } from "@vp-parts-shop/shared";
import {
  deliveryBand,
  isWarehouseSnapshotStale,
  selectWarehouseForQuantity,
  summariseWarehouses,
} from "./availability";

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
  overrides: Partial<WarehouseAvailabilityDto> = {},
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: "18:00",
    cutoffAt: "2026-06-25T15:00:00.000Z",
    pickup: { earliestAt: "2026-06-25T08:00:00.000Z", granularity: "DAY" },
    courier: { earliestAt: "2026-06-26T08:00:00.000Z", granularity: "DAY" },
    ...overrides,
  };
}

describe("summariseWarehouses", () => {
  it("sums the total quantity across every warehouse", () => {
    const summary = summariseWarehouses([
      warehouse("CENTRAL", 7),
      warehouse("REGIONAL_2", 3),
    ]);

    expect(summary.totalQuantity).toBe(10);
  });

  it("decorates rows with Bulgarian warehouse names, fastest-first", () => {
    const summary = summariseWarehouses([
      warehouse("CENTRAL", 2),
      warehouse("REGIONAL_1", 3),
      warehouse("ROMANIA", 5),
      warehouse("POLAND", 1),
    ]);

    expect(summary.warehouses.map((w) => [w.warehouseId, w.name, w.quantity])).toEqual([
      ["CENTRAL", "Централен склад", 2],
      ["REGIONAL_1", "Регионален склад 1", 3],
      ["ROMANIA", "Склад Румъния", 5],
      ["POLAND", "Склад Полша", 1],
    ]);
  });

  it("drops empty warehouses", () => {
    const summary = summariseWarehouses([
      warehouse("CENTRAL", 0),
      warehouse("ROMANIA", 4),
    ]);

    expect(summary.warehouses.map((w) => w.warehouseId)).toEqual(["ROMANIA"]);
    expect(summary.totalQuantity).toBe(4);
  });

  it("returns zeroes for an empty availability list", () => {
    expect(summariseWarehouses([])).toEqual({
      totalQuantity: 0,
      warehouses: [],
    });
  });
});

describe("selectWarehouseForQuantity", () => {
  const rows = [
    warehouse("CENTRAL", 4),
    warehouse("REGIONAL_1", 5),
    warehouse("ROMANIA", 9),
  ];

  it("keeps the fastest warehouse when it covers the quantity", () => {
    expect(selectWarehouseForQuantity(rows, 4)?.warehouseId).toBe("CENTRAL");
  });

  it("advances to the slower band needed to fulfil the whole line", () => {
    expect(selectWarehouseForQuantity(rows, 6)?.warehouseId).toBe("REGIONAL_1");
    expect(selectWarehouseForQuantity(rows, 10)?.warehouseId).toBe("ROMANIA");
  });

  it("falls back to the slowest warehouse when stock is insufficient", () => {
    expect(selectWarehouseForQuantity(rows, 999)?.warehouseId).toBe("ROMANIA");
  });

  it("returns null when nothing is in stock", () => {
    expect(selectWarehouseForQuantity([warehouse("CENTRAL", 0)], 1)).toBeNull();
  });
});

describe("deliveryBand", () => {
  it("maps a within-the-hour clock promise to the fastest band", () => {
    const row = warehouse("CENTRAL", 4, {
      deliveryWorkDays: 0,
      pickup: { earliestAt: "2026-06-25T08:12:00.000Z", granularity: "HOUR" },
    });
    expect(deliveryBand(row)).toBe("within-hour");
  });

  it("keeps the central warehouse green even when its pickup rolled to a date", () => {
    const row = warehouse("CENTRAL", 4, {
      deliveryWorkDays: 0,
      pickup: { earliestAt: "2026-06-26T10:00:00.000Z", granularity: "DAY" },
    });
    expect(deliveryBand(row)).toBe("within-hour");
  });

  it("maps a non-central same-day promise to the today band", () => {
    expect(deliveryBand(warehouse("REGIONAL_1", 4, { deliveryWorkDays: 0 }))).toBe(
      "today",
    );
  });

  it("maps the nominal working-day term to the matching band", () => {
    expect(deliveryBand(warehouse("REGIONAL_1", 4, { deliveryWorkDays: 1 }))).toBe(
      "day1",
    );
    expect(deliveryBand(warehouse("REGIONAL_2", 4, { deliveryWorkDays: 2 }))).toBe(
      "day2",
    );
    expect(deliveryBand(warehouse("ROMANIA", 4, { deliveryWorkDays: 3 }))).toBe(
      "day3",
    );
  });

  it("clamps anything slower than three days to the orange band", () => {
    expect(deliveryBand(warehouse("POLAND", 4, { deliveryWorkDays: 5 }))).toBe(
      "day3",
    );
  });
});

describe("isWarehouseSnapshotStale", () => {
  const computedAt = "2026-06-25T07:00:00.000Z"; // 10:00 Sofia

  it("is fresh while the within-the-hour moment is still ahead", () => {
    const row = warehouse("CENTRAL", 4, {
      pickup: { earliestAt: "2026-06-25T08:12:00.000Z", granularity: "HOUR" },
    });
    const now = new Date("2026-06-25T07:30:00.000Z"); // 10:30, before 11:12
    expect(isWarehouseSnapshotStale(row, computedAt, now)).toBe(false);
  });

  it("is stale once the within-the-hour moment has passed", () => {
    const row = warehouse("CENTRAL", 4, {
      pickup: { earliestAt: "2026-06-25T08:12:00.000Z", granularity: "HOUR" },
    });
    const now = new Date("2026-06-25T09:00:00.000Z"); // 12:00, after 11:12
    expect(isWarehouseSnapshotStale(row, computedAt, now)).toBe(true);
  });

  it("is stale once an order cut-off that was ahead has passed", () => {
    // Regional 1 computed at 10:00 with an 11:00 cut-off; ordering at 13:00.
    const row = warehouse("REGIONAL_1", 5, {
      cutoffAt: "2026-06-25T08:00:00.000Z", // 11:00 Sofia
    });
    const now = new Date("2026-06-25T10:00:00.000Z"); // 13:00 Sofia
    expect(isWarehouseSnapshotStale(row, computedAt, now)).toBe(true);
  });

  it("is fresh when the cut-off was already behind at compute time", () => {
    // Loaded at 12:00 (after the 11:00 cut-off): the date already rolled, so a
    // later order does not make it more stale.
    const row = warehouse("REGIONAL_1", 5, {
      cutoffAt: "2026-06-25T08:00:00.000Z", // 11:00 Sofia
    });
    const lateCompute = "2026-06-25T09:00:00.000Z"; // 12:00 Sofia
    const now = new Date("2026-06-25T10:00:00.000Z"); // 13:00 Sofia
    expect(isWarehouseSnapshotStale(row, lateCompute, now)).toBe(false);
  });
});
