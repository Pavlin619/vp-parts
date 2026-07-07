import { act, renderHook } from "@testing-library/react";
import type { WarehouseAvailabilityDto, WarehouseId } from "@vp-parts-shop/shared";
import { MAX_QUANTITY, useBuyBoxQuantity } from "./use-buy-box-quantity";

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: "18:00",
    cutoffAt: "2099-06-25T15:00:00.000Z",
    pickup: { earliestAt: "2020-01-06T08:00:00.000Z", granularity: "DAY" },
    courier: { earliestAt: "2020-01-07T08:00:00.000Z", granularity: "DAY" },
  };
}

describe("useBuyBoxQuantity", () => {
  it("starts at 1 and caps at the absolute ceiling with no stock breakdown", () => {
    const { result } = renderHook(() => useBuyBoxQuantity([]));

    expect(result.current.selectedQuantity).toBe(1);
    expect(result.current.maxQuantity).toBe(MAX_QUANTITY);
  });

  it("caps the max at the total stock across warehouses", () => {
    const { result } = renderHook(() =>
      useBuyBoxQuantity([warehouse("CENTRAL", 2), warehouse("REGIONAL_1", 1)]),
    );

    expect(result.current.maxQuantity).toBe(3);
  });

  it("steps within [1, maxQuantity]", () => {
    const { result } = renderHook(() =>
      useBuyBoxQuantity([warehouse("CENTRAL", 3)]),
    );

    act(() => result.current.changeQuantity(-1));
    expect(result.current.selectedQuantity).toBe(1);

    act(() => result.current.changeQuantity(5));
    expect(result.current.selectedQuantity).toBe(3);
  });

  it("clamps the selection down when a re-validation shrinks stock", () => {
    const { result, rerender } = renderHook(
      ({ rows }: { rows: WarehouseAvailabilityDto[] }) => useBuyBoxQuantity(rows),
      { initialProps: { rows: [warehouse("CENTRAL", 5)] } },
    );

    act(() => result.current.changeQuantity(4));
    expect(result.current.selectedQuantity).toBe(5);

    rerender({ rows: [warehouse("CENTRAL", 2)] });
    expect(result.current.selectedQuantity).toBe(2);
  });
});
