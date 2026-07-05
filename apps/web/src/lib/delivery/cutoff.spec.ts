import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import {
  describeCutoffCountdown,
  NEAR_CUTOFF_THRESHOLD_MINUTES,
  SHOW_CUTOFF_WINDOW_MINUTES,
} from "./cutoff";

function warehouse(
  cutoffAt: string,
  orderCutoffTime = "11:00",
): WarehouseAvailabilityDto {
  return {
    warehouseId: "REGIONAL_1",
    quantity: 5,
    deliveryWorkDays: 0,
    orderCutoffTime,
    cutoffAt,
    pickup: { earliestAt: cutoffAt, granularity: "DAY" },
    courier: { earliestAt: cutoffAt, granularity: "DAY" },
  };
}

describe("describeCutoffCountdown", () => {
  const now = new Date("2026-07-01T08:00:00.000Z");

  it("reports the cut-off clock and remaining minutes", () => {
    // 45 minutes ahead.
    const result = describeCutoffCountdown(
      warehouse("2026-07-01T08:45:00.000Z"),
      now,
    );
    expect(result?.orderCutoffTime).toBe("11:00");
    expect(result?.minutesRemaining).toBe(45);
  });

  it("rounds partial minutes up so the countdown never reads 0 early", () => {
    const result = describeCutoffCountdown(
      warehouse("2026-07-01T08:30:30.000Z"),
      now,
    );
    expect(result?.minutesRemaining).toBe(31);
  });

  it("flags the final stretch as urgent", () => {
    const urgent = new Date(
      now.getTime() + (NEAR_CUTOFF_THRESHOLD_MINUTES - 5) * 60_000,
    ).toISOString();
    const calm = new Date(
      now.getTime() + (NEAR_CUTOFF_THRESHOLD_MINUTES + 5) * 60_000,
    ).toISOString();

    expect(describeCutoffCountdown(warehouse(urgent), now)?.isUrgent).toBe(true);
    expect(describeCutoffCountdown(warehouse(calm), now)?.isUrgent).toBe(false);
  });

  it("fills the progress bar at the edge of the show window", () => {
    const atWindowEdge = new Date(
      now.getTime() + SHOW_CUTOFF_WINDOW_MINUTES * 60_000,
    ).toISOString();
    expect(describeCutoffCountdown(warehouse(atWindowEdge), now)?.fraction).toBe(1);
  });

  it("keeps a minimum sliver of progress just before the cut-off", () => {
    const result = describeCutoffCountdown(
      warehouse("2026-07-01T08:01:00.000Z"),
      now,
    );
    expect(result?.fraction).toBeGreaterThanOrEqual(0.04);
  });

  it("hides the notice when the cut-off is beyond the show window", () => {
    const beyondWindow = new Date(
      now.getTime() + (SHOW_CUTOFF_WINDOW_MINUTES + 30) * 60_000,
    ).toISOString();
    expect(describeCutoffCountdown(warehouse(beyondWindow), now)).toBeNull();
  });

  it("hides the notice when the cut-off is not today in the shop timezone", () => {
    // Shop is closed and the backend rolled cutoffAt to the next open day: it is
    // within the show window in raw minutes, but falls on a later shop-local day.
    // 23:30 Sofia on 1 Jul, cut-off 00:30 Sofia on 2 Jul (60 min ahead).
    const lateEvening = new Date("2026-07-01T20:30:00.000Z");
    const nextDayCutoff = "2026-07-01T21:30:00.000Z";
    expect(
      describeCutoffCountdown(warehouse(nextDayCutoff), lateEvening),
    ).toBeNull();
  });

  it("returns null once the cut-off has passed (staleness handling owns it)", () => {
    expect(
      describeCutoffCountdown(warehouse("2026-07-01T07:59:00.000Z"), now),
    ).toBeNull();
    expect(
      describeCutoffCountdown(warehouse("2026-07-01T08:00:00.000Z"), now),
    ).toBeNull();
  });
});
