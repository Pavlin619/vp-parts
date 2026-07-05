import { act, renderHook } from "@testing-library/react";
import { useNow } from "./use-now";

describe("useNow", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("becomes a Date after mount and advances on each interval tick", () => {
    jest.setSystemTime(new Date("2026-07-01T08:00:00.000Z"));
    const { result } = renderHook(() => useNow(1000));

    // The mount effect seeds `now`, so it is live immediately after render.
    expect(result.current).toBeInstanceOf(Date);
    const first = (result.current as Date).getTime();

    act(() => {
      jest.setSystemTime(new Date("2026-07-01T08:00:05.000Z"));
      jest.advanceTimersByTime(1000);
    });

    expect((result.current as Date).getTime()).toBeGreaterThan(first);
  });

  it("clears its interval on unmount", () => {
    const clearSpy = jest.spyOn(global, "clearInterval");
    const { unmount } = renderHook(() => useNow(1000));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
