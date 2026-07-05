import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  DeliveryProjectionDto,
  WarehouseAvailabilityDto,
  WarehouseId,
} from "@vp-parts-shop/shared";
import { DeliveryEstimate } from "./delivery-estimate";

function projection(
  earliestAt: string,
  granularity: DeliveryProjectionDto["granularity"],
): DeliveryProjectionDto {
  return { earliestAt, granularity };
}

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
  pickup: DeliveryProjectionDto,
  courier: DeliveryProjectionDto,
  cutoffAt = "2099-06-25T15:00:00.000Z",
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: "18:00",
    cutoffAt,
    pickup,
    courier,
  };
}

// Fresh fixtures: the within-the-hour instant is far in the future so the clock
// time formats deterministically without tripping the staleness guard. The DAY
// fixtures use a far-past date so they format as a full date, never днес/утре.
const rows = [
  warehouse(
    "CENTRAL",
    4,
    projection("2099-06-25T08:12:00.000Z", "HOUR"),
    projection("2020-01-07T08:00:00.000Z", "DAY"),
  ),
  warehouse(
    "REGIONAL_1",
    5,
    projection("2020-01-08T08:00:00.000Z", "DAY"),
    projection("2020-01-09T08:00:00.000Z", "DAY"),
  ),
];

describe("DeliveryEstimate", () => {
  it("shows the courier projection to an address by default", () => {
    render(<DeliveryEstimate availabilityByWarehouse={rows} quantity={1} />);

    expect(screen.getByText(/До адрес/)).toBeInTheDocument();
    expect(
      screen.getByTestId("delivery-estimate-chip-courier"),
    ).toHaveTextContent("януари");
  });

  it("switches to the store pickup projection when toggled", async () => {
    const user = userEvent.setup();
    render(<DeliveryEstimate availabilityByWarehouse={rows} quantity={1} />);

    await user.click(screen.getByRole("button", { name: /От магазин/ }));

    expect(screen.getByText(/Готово за вземане/)).toBeInTheDocument();
    expect(screen.getByTestId("delivery-estimate-chip-store")).toHaveTextContent(
      "за 11:12 ч.",
    );
  });

  it("promises the slower warehouse when the quantity exceeds the fastest stock", () => {
    render(<DeliveryEstimate availabilityByWarehouse={rows} quantity={6} />);

    const chip = screen.getByTestId("delivery-estimate-chip-courier");
    expect(chip).toHaveTextContent("9");
    expect(chip).toHaveTextContent("януари");
  });

  it("shows the free-shipping threshold", () => {
    render(<DeliveryEstimate availabilityByWarehouse={rows} quantity={1} />);

    expect(
      screen.getByText(/Безплатна доставка при поръчка над 120 лв/),
    ).toBeInTheDocument();
  });

  it("renders nothing when there is no stock", () => {
    const { container } = render(
      <DeliveryEstimate availabilityByWarehouse={[]} quantity={1} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a neutral label instead of a stale within-the-hour time", async () => {
    const user = userEvent.setup();
    const stale = [
      warehouse(
        "CENTRAL",
        4,
        // A within-the-hour moment already in the past.
        projection("2020-01-01T08:00:00.000Z", "HOUR"),
        projection("2020-01-02T08:00:00.000Z", "DAY"),
      ),
    ];

    render(<DeliveryEstimate availabilityByWarehouse={stale} quantity={1} />);

    await user.click(screen.getByRole("button", { name: /От магазин/ }));

    expect(screen.getByTestId("delivery-estimate-chip-store")).toHaveTextContent(
      "обновяване…",
    );
  });

  it("shows the neutral label until the shared clock is live (now is null)", () => {
    render(
      <DeliveryEstimate availabilityByWarehouse={rows} quantity={1} now={null} />,
    );

    expect(
      screen.getByTestId("delivery-estimate-chip-courier"),
    ).toHaveTextContent("обновяване…");
  });
});
