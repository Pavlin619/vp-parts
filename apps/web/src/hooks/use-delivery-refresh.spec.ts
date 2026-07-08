import { renderHook } from "@testing-library/react";
import { useDeliveryRefresh } from "./use-delivery-refresh";

const refresh = jest.fn();

describe("useDeliveryRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    refresh.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing without a computedAt", () => {
    renderHook(() => useDeliveryRefresh(null, [], refresh));
    jest.advanceTimersByTime(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the soonest upcoming cut-off is reached", () => {
    const now = Date.now();
    const cutoff = new Date(now + 30_000).toISOString();

    renderHook(() =>
      useDeliveryRefresh(new Date(now).toISOString(), [cutoff], refresh),
    );

    jest.advanceTimersByTime(29_000);
    expect(refresh).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores cut-offs already in the past", () => {
    const now = Date.now();
    const past = new Date(now - 10_000).toISOString();

    renderHook(() =>
      useDeliveryRefresh(new Date(now).toISOString(), [past], refresh),
    );

    jest.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes on focus once the snapshot has aged past the TTL", () => {
    const computedAt = new Date(Date.now() - 120_000).toISOString();
    renderHook(() => useDeliveryRefresh(computedAt, [], refresh));

    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on focus while the snapshot is still fresh", () => {
    const computedAt = new Date(Date.now() - 1_000).toISOString();
    renderHook(() => useDeliveryRefresh(computedAt, [], refresh));

    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
