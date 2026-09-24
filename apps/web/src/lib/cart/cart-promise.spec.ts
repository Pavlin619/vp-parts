import type {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
} from "@vp-parts-shop/shared";
import type { CartLine } from "@/hooks/use-cart";
import type { CartRowModel } from "./cart-totals";
import { resolveOrderPromise } from "./cart-promise";

function warehouse(
  overrides: Partial<WarehouseAvailabilityDto> = {},
): WarehouseAvailabilityDto {
  return {
    warehouseId: "REGIONAL_1",
    quantity: 5,
    deliveryWorkDays: 1,
    orderCutoffTime: "18:00",
    cutoffAt: "2026-07-01T15:00:00.000Z",
    pickup: { earliestAt: "2026-07-02T06:00:00.000Z", granularity: "DAY" },
    courier: { earliestAt: "2026-07-03T06:00:00.000Z", granularity: "DAY" },
    ...overrides,
  };
}

function detail(
  availabilityByWarehouse: WarehouseAvailabilityDto[],
): ArticleInventoryDetailDto {
  return {
    available: true,
    bestPriceExVat: 1000,
    bestPriceIncVat: 1200,
    availabilityByWarehouse,
    computedAt: "2026-07-01T08:00:00.000Z",
  };
}

function line(quantity = 1): CartLine {
  return {
    brandId: "77",
    articleNumber: "P-1",
    brandName: "BREMBO",
    brandLogoUrl: null,
    description: "Комплект накладки",
    thumbnailUrl: null,
    quantity,
    isSelected: true,
    addedAtPriceIncVat: null,
  };
}

function row(overrides: Partial<CartRowModel> = {}): CartRowModel {
  return {
    line: line(),
    availability: detail([warehouse()]),
    unitPriceExVat: 1000,
    unitPriceIncVat: 1200,
    lineTotalExVat: 1000,
    lineTotalIncVat: 1200,
    issue: null,
    priceChange: null,
  availableQuantity: 5,
    maxQuantity: 5,
    ...overrides,
  };
}

describe("resolveOrderPromise", () => {
  it("quotes the pickup date, because no delivery method is chosen yet", () => {
    const promise = resolveOrderPromise([row()]);

    expect(promise).toEqual({
      cutoffAt: "2026-07-01T15:00:00.000Z",
      orderCutoffTime: "18:00",
      warehouseName: "Регионален склад 1",
      fulfilledAt: "2026-07-02T06:00:00.000Z",
      isPickup: true,
    });
  });

  it("quotes the courier date once delivery is by courier", () => {
    const promise = resolveOrderPromise([row()], "courier");

    expect(promise?.fulfilledAt).toBe("2026-07-03T06:00:00.000Z");
    expect(promise?.isPickup).toBe(false);
  });

  it("binds the basket to the earliest cut-off and the slowest line", () => {
    const promise = resolveOrderPromise([
      row({
        availability: detail([
          warehouse({
            warehouseId: "CENTRAL",
            orderCutoffTime: "14:00",
            cutoffAt: "2026-07-01T11:00:00.000Z",
            pickup: {
              earliestAt: "2026-07-01T12:00:00.000Z",
              granularity: "DAY",
            },
          }),
        ]),
      }),
      row({
        availability: detail([
          warehouse({
            warehouseId: "POLAND",
            cutoffAt: "2026-07-01T15:00:00.000Z",
            pickup: {
              earliestAt: "2026-07-06T06:00:00.000Z",
              granularity: "DAY",
            },
          }),
        ]),
      }),
    ]);

    expect(promise?.orderCutoffTime).toBe("14:00");
    expect(promise?.warehouseName).toBe("Централен склад");
    expect(promise?.fulfilledAt).toBe("2026-07-06T06:00:00.000Z");
  });

  // The whole line ships from one warehouse, so asking for more than the
  // fastest one holds moves the promise to the slower one that can cover it.
  it("promises the warehouse that covers the whole line quantity", () => {
    const promise = resolveOrderPromise([
      row({
        line: line(4),
        availability: detail([
          warehouse({
            warehouseId: "CENTRAL",
            quantity: 2,
            pickup: {
              earliestAt: "2026-07-01T12:00:00.000Z",
              granularity: "DAY",
            },
          }),
          warehouse({
            warehouseId: "POLAND",
            quantity: 9,
            pickup: {
              earliestAt: "2026-07-06T06:00:00.000Z",
              granularity: "DAY",
            },
          }),
        ]),
      }),
    ]);

    expect(promise?.fulfilledAt).toBe("2026-07-06T06:00:00.000Z");
  });

  // The summary's money leaves blocked lines out, so the deadline does too.
  it("ignores the lines that cannot be ordered", () => {
    const promise = resolveOrderPromise([
      row(),
      row({
        availability: detail([]),
        issue: "unavailable",
        availableQuantity: 0,
      }),
    ]);

    expect(promise?.fulfilledAt).toBe("2026-07-02T06:00:00.000Z");
  });

  it("promises nothing while a line's availability is still in flight", () => {
    expect(
      resolveOrderPromise([
        row(),
        row({ availability: undefined, availableQuantity: null }),
      ]),
    ).toBeNull();
  });

  // In stock, but with no per-warehouse breakdown there is no date to quote —
  // and a deadline that silently leaves a line out is one the order cannot meet.
  it("promises nothing when a line reports no warehouses", () => {
    expect(
      resolveOrderPromise([row({ availability: detail([]), availableQuantity: null })]),
    ).toBeNull();
  });

  it("promises nothing for an empty selection", () => {
    expect(resolveOrderPromise([])).toBeNull();
  });
});
