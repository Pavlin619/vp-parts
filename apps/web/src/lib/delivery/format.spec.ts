import type { DeliveryProjectionDto } from "@vp-parts-shop/shared";
import { formatClock, formatDay, formatDeliveryLabel } from "./format";

// 2026-06-25 is a Thursday. 07:12Z == 10:12 in Sofia (UTC+3, summer time).
const NOW = new Date("2026-06-25T07:12:00.000Z");

function projection(
  earliestAt: string,
  granularity: DeliveryProjectionDto["granularity"],
): DeliveryProjectionDto {
  return { earliestAt, granularity };
}

describe("formatClock", () => {
  it("renders the instant in the shop timezone, not UTC", () => {
    expect(formatClock("2026-06-25T08:12:00.000Z")).toBe("11:12");
  });

  it("is stable for a winter (UTC+2) instant", () => {
    expect(formatClock("2026-01-15T09:30:00.000Z")).toBe("11:30");
  });
});

describe("formatDay", () => {
  it("labels a same shop-day instant as днес", () => {
    expect(formatDay("2026-06-25T12:00:00.000Z", NOW)).toBe("днес");
  });

  it("labels the next shop-day as утре", () => {
    expect(formatDay("2026-06-26T09:00:00.000Z", NOW)).toBe("утре");
  });

  it("renders a full Bulgarian date for later days", () => {
    const label = formatDay("2026-06-29T09:00:00.000Z", NOW);
    expect(label).toContain("29");
    expect(label).toContain("юни");
  });
});

describe("formatDeliveryLabel", () => {
  it("renders within-the-hour projections as a clock time", () => {
    expect(formatDeliveryLabel(projection("2026-06-25T08:12:00.000Z", "HOUR"), NOW)).toBe(
      "за 11:12 ч.",
    );
  });

  it("renders day projections relative to now", () => {
    expect(formatDeliveryLabel(projection("2026-06-26T09:00:00.000Z", "DAY"), NOW)).toBe(
      "утре",
    );
  });
});
