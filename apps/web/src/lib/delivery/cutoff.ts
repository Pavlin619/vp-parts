import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { shopDateKey } from "./format";

/** Below this many minutes to the cut-off we treat the countdown as urgent. */
export const NEAR_CUTOFF_THRESHOLD_MINUTES = 120;

/**
 * How close to the cut-off we start showing the countdown. Beyond this the
 * notice carries no actionable value — ordering now vs. later does not change
 * the delivery date — so we hide it rather than manufacture false urgency. It
 * also spans the progress bar, so the bar visibly depletes across the panel's
 * whole visible lifetime instead of sitting full most of the day.
 */
export const SHOW_CUTOFF_WINDOW_MINUTES = 180;

export interface CutoffCountdown {
  /** The customer-facing cut-off clock, e.g. "11:00". */
  orderCutoffTime: string;
  /** Whole minutes left until the cut-off (always >= 1). */
  minutesRemaining: number;
  /** 0–1 share of the countdown window still left — drives the progress bar. */
  fraction: number;
  /** Within the final urgent stretch — flips the bar to a warning tone. */
  isUrgent: boolean;
}

/**
 * Describes the live countdown to the selected warehouse's order cut-off, or
 * null when the notice is not worth showing. We only surface it when ordering
 * now actually beats a real deadline: the cut-off must be today (shop timezone)
 * and within SHOW_CUTOFF_WINDOW_MINUTES. This suppresses the misleading case
 * where the shop is closed (e.g. Sunday) and the backend has rolled cutoffAt to
 * the next open day, which would otherwise read as "order in 23 h" urgency.
 *
 * Once the cut-off passes we also return null; the staleness handling (see
 * isWarehouseSnapshotStale) re-validates the page instead. The fraction lets the
 * UI draw a shrinking progress bar and the urgent flag flips its colour near the
 * deadline.
 */
export function describeCutoffCountdown(
  warehouse: WarehouseAvailabilityDto,
  now: Date = new Date(),
): CutoffCountdown | null {
  const cutoffAt = new Date(warehouse.cutoffAt);

  const remainingMs = cutoffAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return null;
  }

  const minutesRemaining = Math.ceil(remainingMs / 60_000);

  // Too far ahead to be actionable, or the cut-off is not today (shop tz) —
  // e.g. the shop is closed and the backend rolled cutoffAt to the next open
  // day. Either way, hide the notice.
  if (minutesRemaining > SHOW_CUTOFF_WINDOW_MINUTES) {
    return null;
  }
  if (shopDateKey(cutoffAt) !== shopDateKey(now)) {
    return null;
  }

  const fraction = Math.max(
    0.04,
    Math.min(1, minutesRemaining / SHOW_CUTOFF_WINDOW_MINUTES),
  );
  const isUrgent = minutesRemaining < NEAR_CUTOFF_THRESHOLD_MINUTES;

  return {
    orderCutoffTime: warehouse.orderCutoffTime,
    minutesRemaining,
    fraction,
    isUrgent,
  };
}
