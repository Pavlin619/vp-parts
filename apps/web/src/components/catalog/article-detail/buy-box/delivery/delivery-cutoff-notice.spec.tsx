import { render, screen } from "@testing-library/react";
import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { DeliveryCutoffNotice } from "./delivery-cutoff-notice";

function warehouse(
  cutoffAt: string,
  pickupAt: string = cutoffAt,
): WarehouseAvailabilityDto {
  return {
    warehouseId: "REGIONAL_1",
    quantity: 5,
    deliveryWorkDays: 0,
    orderCutoffTime: "11:00",
    cutoffAt,
    pickup: { earliestAt: pickupAt, granularity: "DAY" },
    courier: { earliestAt: pickupAt, granularity: "DAY" },
  };
}

describe("DeliveryCutoffNotice", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-01T08:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the cut-off time, delivery outcome and remaining minutes", () => {
    // 40 minutes ahead of 08:00; same shop-local day, so delivery reads "днес".
    render(<DeliveryCutoffNotice warehouse={warehouse("2026-07-01T08:40:00.000Z")} />);

    const notice = screen.getByTestId("delivery-cutoff-notice");
    expect(notice).toHaveTextContent("Поръчай до 11:00 ч.");
    expect(notice).toHaveTextContent("за доставка днес");
    expect(notice).toHaveTextContent("остават 40 мин");
  });

  it("formats a multi-hour remainder in hours and minutes", () => {
    // 90 minutes ahead.
    render(<DeliveryCutoffNotice warehouse={warehouse("2026-07-01T09:30:00.000Z")} />);
    expect(screen.getByTestId("delivery-cutoff-notice")).toHaveTextContent(
      "1 ч 30 мин",
    );
  });

  it("hides the countdown when the cut-off is beyond the show window", () => {
    // 6 hours ahead — no longer actionable, so the notice stays hidden.
    render(<DeliveryCutoffNotice warehouse={warehouse("2026-07-01T14:00:00.000Z")} />);
    expect(
      screen.queryByTestId("delivery-cutoff-notice"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing once the cut-off has passed", () => {
    render(<DeliveryCutoffNotice warehouse={warehouse("2026-07-01T07:30:00.000Z")} />);
    expect(screen.queryByTestId("delivery-cutoff-notice")).not.toBeInTheDocument();
  });
});
