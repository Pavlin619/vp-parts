import type { DeliveryProjectionDto } from "@vp-parts-shop/shared";

/**
 * The backend computes every delivery date in the shop timezone and sends it as
 * an absolute UTC instant. The frontend formats it back in the same timezone so
 * the label is correct regardless of the visitor's (or Vercel's) locale.
 */
const SHOP_TIME_ZONE = "Europe/Sofia";

const MILLIS_PER_DAY = 86_400_000;

/**
 * Customer-facing Bulgarian label for a delivery projection. "Within the hour"
 * projections render a clock time ("за 11:12 ч."); day-grained projections
 * render a relative day ("днес", "утре") or a full date ("пн, 6 юли").
 */
export function formatDeliveryLabel(
  projection: DeliveryProjectionDto,
  now: Date = new Date(),
): string {
  if (projection.granularity === "HOUR") {
    return `за ${formatClock(projection.earliestAt)} ч.`;
  }
  return formatDay(projection.earliestAt, now);
}

export function formatClock(earliestAt: string): string {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: SHOP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(earliestAt));
}

export function formatDay(earliestAt: string, now: Date = new Date()): string {
  const target = new Date(earliestAt);
  const targetKey = shopDateKey(target);

  if (targetKey === shopDateKey(now)) {
    return "днес";
  }
  if (targetKey === shopDateKey(new Date(now.getTime() + MILLIS_PER_DAY))) {
    return "утре";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: SHOP_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(target);
}

/** Shop-local YYYY-MM-DD, used to compare calendar days across timezones. */
export function shopDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
