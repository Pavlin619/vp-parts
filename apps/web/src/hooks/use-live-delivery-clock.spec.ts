import { renderHook } from "@testing-library/react";
import type { WarehouseAvailabilityDto, WarehouseId } from "@vp-parts-shop/shared";
import { useLiveDeliveryClock } from "./use-live-delivery-clock";

const refresh = jest.fn();

function warehouse(
  warehouseId: WarehouseId,
  cutoffAt: string,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity: 5,
    deliveryWorkDays: 0,
    orderCutoffTime: "18:00",
    cutoffAt,
    pickup: { earliestAt: "2020-01-06T08:00:00.000Z", granularity: "DAY" },
    courier: { earliestAt: "2020-01-07T08:00:00.000Z", granularity: "DAY" },
  };
}

describe("useLiveDeliveryClock", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    refresh.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("exposes a live clock once mounted", () => {
    const computedAt = new Date().toISOString();
    const { result } = renderHook(() =>
      useLiveDeliveryClock(computedAt, [], refresh),
    );

    expect(result.current).toBeInstanceOf(Date);
  });

  it("refetches when the soonest upcoming cut-off passes", () => {
    const now = Date.now();
    const rows = [warehouse("CENTRAL", new Date(now + 30_000).toISOString())];

    renderHook(() =>
      useLiveDeliveryClock(new Date(now).toISOString(), rows, refresh),
    );

    jest.advanceTimersByTime(31_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
