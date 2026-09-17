import { render, screen } from "@testing-library/react";
import type { DeliveryPromise } from "@/lib/delivery/promise";
import { DeliveryCutoffPromise } from "./delivery-cutoff-promise";

function promise(overrides: Partial<DeliveryPromise> = {}): DeliveryPromise {
  return {
    cutoffAt: "2026-07-01T08:40:30.000Z",
    orderCutoffTime: "11:00",
    warehouseName: "Централен склад",
    fulfilledAt: "2026-07-01T14:00:00.000Z",
    isPickup: false,
    ...overrides,
  };
}

describe("DeliveryCutoffPromise", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-01T08:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("asks for the delivery day and counts down to the deadline that buys it", () => {
    render(<DeliveryCutoffPromise promise={promise()} />);

    const panel = screen.getByTestId("delivery-cutoff-promise");
    expect(panel).toHaveTextContent("Да пристигне днес?");
    expect(panel).toHaveTextContent("Поръчайте в рамките на");
    expect(panel).toHaveTextContent("40 мин 30 сек");
    expect(panel).toHaveTextContent("до 11:00 ч. от Централен склад");
  });

  it("counts a long remainder in hours and minutes", () => {
    render(
      <DeliveryCutoffPromise
        promise={promise({ cutoffAt: "2026-07-01T09:30:00.000Z" })}
      />,
    );

    expect(screen.getByTestId("delivery-cutoff-promise")).toHaveTextContent(
      "1 ч 30 мин",
    );
  });

  it("says a pickup is ready rather than delivered", () => {
    render(
      <DeliveryCutoffPromise
        promise={promise({
          isPickup: true,
          fulfilledAt: "2026-07-02T14:00:00.000Z",
        })}
      />,
    );

    expect(screen.getByTestId("delivery-cutoff-promise")).toHaveTextContent(
      "Готова за вземане утре?",
    );
  });

  it("shows the note under the headline when given one", () => {
    render(
      <DeliveryCutoffPromise promise={promise()} note="Изберете метод на доставка." />,
    );

    expect(screen.getByText("Изберете метод на доставка.")).toBeInTheDocument();
  });

  it("stays hidden when there is no promise to make", () => {
    const { container } = render(<DeliveryCutoffPromise promise={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  // Beyond the show window ordering now buys nothing the next hour would not,
  // so nudging would be manufactured urgency.
  it("stays hidden when the deadline is too far off to be actionable", () => {
    render(
      <DeliveryCutoffPromise
        promise={promise({ cutoffAt: "2026-07-01T14:00:00.000Z" })}
      />,
    );

    expect(
      screen.queryByTestId("delivery-cutoff-promise"),
    ).not.toBeInTheDocument();
  });

  it("stays hidden once the deadline has passed", () => {
    render(
      <DeliveryCutoffPromise
        promise={promise({ cutoffAt: "2026-07-01T07:30:00.000Z" })}
      />,
    );

    expect(
      screen.queryByTestId("delivery-cutoff-promise"),
    ).not.toBeInTheDocument();
  });
});
