import { renderHook } from "@testing-library/react";
import { useCutoffRefresh } from "./use-cutoff-refresh";

const refresh = jest.fn();

/** An ISO cut-off `offsetMs` from now. */
function cutoffIn(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe("useCutoffRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    refresh.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("refreshes once the cut-off is reached", () => {
    renderHook(() => useCutoffRefresh([cutoffIn(30_000)], refresh));

    jest.advanceTimersByTime(29_000);
    expect(refresh).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // One page holds many warehouses and many articles, but only the first
  // boundary changes what is on screen; the read it triggers brings the rest.
  it("schedules on the soonest cut-off of many", () => {
    renderHook(() =>
      useCutoffRefresh(
        [cutoffIn(90_000), cutoffIn(20_000), cutoffIn(50_000)],
        refresh,
      ),
    );

    jest.advanceTimersByTime(21_500);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores cut-offs already behind us", () => {
    renderHook(() => useCutoffRefresh([cutoffIn(-10_000)], refresh));

    jest.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing without any cut-off", () => {
    renderHook(() => useCutoffRefresh([], refresh));

    jest.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  // `setTimeout` wraps a delay past ~24.8 days into a near-zero one, which would
  // fire immediately, refetch, and schedule the same overflow again.
  it("schedules nothing for a cut-off too far out to time", () => {
    renderHook(() =>
      useCutoffRefresh([cutoffIn(40 * 24 * 60 * 60 * 1000)], refresh),
    );

    jest.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  // The callers pass an inline arrow, so keying the effect on the array's
  // identity would tear the timer down and rebuild it on every render.
  it("keeps one timer across re-renders with the same cut-offs", () => {
    const cutoff = cutoffIn(30_000);
    const { rerender } = renderHook(() =>
      useCutoffRefresh([cutoff], () => refresh()),
    );

    jest.advanceTimersByTime(20_000);
    rerender();
    jest.advanceTimersByTime(11_000);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reschedules when the cut-offs change", () => {
    const { rerender } = renderHook(
      ({ cutoffs }: { cutoffs: string[] }) =>
        useCutoffRefresh(cutoffs, refresh),
      { initialProps: { cutoffs: [cutoffIn(90_000)] } },
    );

    rerender({ cutoffs: [cutoffIn(10_000)] });
    jest.advanceTimersByTime(11_500);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("drops the timer on unmount", () => {
    const { unmount } = renderHook(() =>
      useCutoffRefresh([cutoffIn(30_000)], refresh),
    );

    unmount();
    jest.advanceTimersByTime(120_000);

    expect(refresh).not.toHaveBeenCalled();
  });
});
