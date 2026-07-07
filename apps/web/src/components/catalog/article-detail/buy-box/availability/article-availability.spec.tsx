import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WarehouseAvailabilityDto, WarehouseId } from "@vp-parts-shop/shared";
import { ArticleAvailability } from "./article-availability";

// A fixed live clock keeps the formatted per-warehouse dates deterministic; the
// fixtures use a far-past pickup so they never format as днес/утре.
const NOW = new Date("2026-07-01T08:00:00.000Z");

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
  overrides: Partial<WarehouseAvailabilityDto> = {},
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: "18:00",
    cutoffAt: "2099-06-25T15:00:00.000Z",
    pickup: { earliestAt: "2020-01-06T08:00:00.000Z", granularity: "DAY" },
    courier: { earliestAt: "2020-01-07T08:00:00.000Z", granularity: "DAY" },
    ...overrides,
  };
}

describe("ArticleAvailability", () => {
  it("names the fastest in-stock warehouse and its quantity in the headline", () => {
    render(
      <ArticleAvailability
        now={NOW}
        availabilityByWarehouse={[
          warehouse("CENTRAL", 7),
          warehouse("ROMANIA", 5, { orderCutoffTime: "17:00" }),
        ]}
      />,
    );

    expect(screen.getByTestId("availability-headline")).toHaveTextContent(
      "Наличен в Централен склад · 7 бр.",
    );
    expect(screen.getByText(/\+ 5 бр\. в 1 друг склад/)).toBeInTheDocument();
  });

  it("names the fastest warehouse even when the central one is empty", () => {
    render(
      <ArticleAvailability
        now={NOW}
        availabilityByWarehouse={[
          warehouse("ROMANIA", 5, { orderCutoffTime: "17:00" }),
        ]}
      />,
    );

    expect(screen.getByTestId("availability-headline")).toHaveTextContent(
      "Наличен в Склад Румъния · 5 бр.",
    );
  });

  it("keeps a positive headline and hides the dialog when no breakdown is provided", () => {
    render(<ArticleAvailability now={NOW} availabilityByWarehouse={[]} />);

    expect(screen.getByText("Наличен в склад")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Наличност по складове/ }),
    ).not.toBeInTheDocument();
  });

  it("lists availability per warehouse under the ready/cut-off header in the dialog", async () => {
    const user = userEvent.setup();
    render(
      <ArticleAvailability
        now={NOW}
        availabilityByWarehouse={[
          warehouse("CENTRAL", 2),
          warehouse("ROMANIA", 5, { orderCutoffTime: "17:00" }),
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Наличност по складове/ }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Готово за / поръчай до")).toBeInTheDocument();
    expect(dialog.getByText("Централен склад")).toBeInTheDocument();
    expect(dialog.getByText("Склад Румъния")).toBeInTheDocument();
    expect(dialog.getAllByText(/готово/).length).toBeGreaterThan(0);
    expect(dialog.getByText(/поръчай до 17:00 ч\./)).toBeInTheDocument();
  });

  it("omits out-of-stock warehouses from the dialog without a filter toggle", async () => {
    const user = userEvent.setup();
    render(
      <ArticleAvailability
        now={NOW}
        availabilityByWarehouse={[warehouse("CENTRAL", 2), warehouse("POLAND", 0)]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Наличност по складове/ }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Централен склад")).toBeInTheDocument();
    expect(dialog.queryByText("Склад Полша")).not.toBeInTheDocument();
    expect(dialog.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
