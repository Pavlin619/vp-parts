import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleDetailSections } from "./article-detail-sections";

// The three sections are stubbed: this spec is about which one is selected, not
// what any of them renders — their own specs cover that, and mounting the real
// ones would need a query client to no purpose. Each stub echoes the part it was
// handed, because all three read TecDoc by brand *and* number.
type SectionProps = { brandId: string; articleNumber: string };

const part = ({ brandId, articleNumber }: SectionProps) =>
  `${brandId}:${articleNumber}`;

jest.mock("@/components/catalog/article-row", () => ({
  ArticleRowSubstitutes: (props: SectionProps) => (
    <div data-testid="substitutes-section">{part(props)}</div>
  ),
  ArticleRowNumbers: (props: SectionProps) => (
    <div data-testid="numbers-section">{part(props)}</div>
  ),
  ArticleRowVehicles: (props: SectionProps) => (
    <div data-testid="vehicles-section">{part(props)}</div>
  ),
}));

function renderSections() {
  return render(
    <ArticleDetailSections brandId="268" articleNumber="WL6340" />,
  );
}

describe("ArticleDetailSections", () => {
  // Substitutes lead: they are the same cross-references as the alternative
  // numbers, but as parts a visitor can compare and buy.
  it("offers the sections in display order", () => {
    renderSections();

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Заменяеми",
      "Алтернативни номера",
      "Приложими автомобили",
    ]);
  });

  // The specs table has its own place in the page's middle column, so the tab
  // strip must not repeat it the way the catalog row's expander does.
  it("does not offer the technical specs section", () => {
    renderSections();

    expect(
      screen.queryByRole("tab", { name: "Технически характеристики" }),
    ).not.toBeInTheDocument();
  });

  it("opens on the substitutes section", () => {
    renderSections();

    expect(screen.getByTestId("substitutes-section")).toHaveTextContent(
      "268:WL6340",
    );
    expect(screen.getByRole("tab", { name: "Заменяеми" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switches to the alternative numbers section", async () => {
    const user = userEvent.setup();
    renderSections();

    await user.click(screen.getByRole("tab", { name: "Алтернативни номера" }));

    expect(screen.getByTestId("numbers-section")).toHaveTextContent(
      "268:WL6340",
    );
    expect(screen.queryByTestId("substitutes-section")).not.toBeInTheDocument();
  });

  it("switches to the applicable vehicles section", async () => {
    const user = userEvent.setup();
    renderSections();

    await user.click(screen.getByRole("tab", { name: "Приложими автомобили" }));

    expect(screen.getByTestId("vehicles-section")).toHaveTextContent(
      "268:WL6340",
    );
    expect(screen.queryByTestId("substitutes-section")).not.toBeInTheDocument();
  });

  // Only the selected section is mounted, so an unread one still costs nothing.
  it("mounts only the selected section", () => {
    renderSections();

    expect(screen.queryByTestId("numbers-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vehicles-section")).not.toBeInTheDocument();
  });

  // A tab strip always has a selection, unlike the row's accordion: there is no
  // collapsed state to fall back to on a page whose section is the page.
  it("keeps the selected section open when its tab is clicked again", async () => {
    const user = userEvent.setup();
    renderSections();

    await user.click(screen.getByRole("tab", { name: "Заменяеми" }));

    expect(screen.getByTestId("substitutes-section")).toBeInTheDocument();
  });

  it("names the selected section on its panel", () => {
    renderSections();

    expect(screen.getByRole("tabpanel", { name: "Заменяеми" })).toContainElement(
      screen.getByTestId("substitutes-section"),
    );
  });

  it("moves to the next section with the right arrow key", async () => {
    const user = userEvent.setup();
    renderSections();

    await user.click(screen.getByRole("tab", { name: "Заменяеми" }));
    await user.keyboard("{ArrowRight}");

    expect(screen.getByTestId("numbers-section")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Алтернативни номера" }),
    ).toHaveFocus();
  });

  it("wraps to the last section with the left arrow key", async () => {
    const user = userEvent.setup();
    renderSections();

    await user.click(screen.getByRole("tab", { name: "Заменяеми" }));
    await user.keyboard("{ArrowLeft}");

    expect(screen.getByTestId("vehicles-section")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Приложими автомобили" }),
    ).toHaveFocus();
  });

  // Roving tabindex: one Tab press reaches the strip, and the arrows move within
  // it, rather than the strip costing a Tab press per section.
  it("keeps only the selected tab in the tab order", async () => {
    const user = userEvent.setup();
    renderSections();

    await user.click(screen.getByRole("tab", { name: "Алтернативни номера" }));

    expect(
      screen
        .getAllByRole("tab")
        .filter((tab) => tab.getAttribute("tabindex") !== "-1")
        .map((tab) => tab.textContent),
    ).toEqual(["Алтернативни номера"]);
  });
});
