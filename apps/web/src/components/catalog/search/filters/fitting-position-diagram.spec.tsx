import { render, screen } from "@testing-library/react";
import type {
  AttributeFacetValueDto,
  FittingPositionZone,
} from "@vp-parts-shop/shared";
import { DEFAULT_SEARCH_MODE } from "@vp-parts-shop/shared";
import { newSearch, type SearchUrlState } from "@/lib/catalog/search-url";
import {
  diagramZones,
  FittingPositionDiagram,
} from "./fitting-position-diagram";

const FITTING_POSITION_ID = "100";

function value(
  label: string,
  token: string,
  count: number,
  zone?: FittingPositionZone,
): AttributeFacetValueDto {
  return { value: token, label, count, ...(zone && { zone }) };
}

const FRONT_AXLE = value("предна ос", "VA", 34076, "front-axle");
const REAR_AXLE = value("задна ос", "HA", 20129, "rear-axle");
const FRONT_LEFT = value("на предната ос отляво", "VL", 1088, "front-left");
const FRONT_LEFT_SYNONYM = value("отпред отляво", "LV", 12, "front-left");
const UNPLACEABLE = value("двустранен", "FB", 900);

function stateWith(
  attributes: SearchUrlState["attributes"] = [],
): SearchUrlState {
  return {
    ...newSearch({ query: "спирачен диск", mode: DEFAULT_SEARCH_MODE }),
    attributes,
  };
}

describe("diagramZones", () => {
  it("keeps only the values the API placed on the car", () => {
    const zones = diagramZones([FRONT_AXLE, UNPLACEABLE]);

    expect(zones.map((entry) => entry.zone)).toEqual(["front-axle"]);
  });

  it("sums the values that share a zone and collects their tokens", () => {
    // The silent bug this guards: a zone offering only the busier spelling
    // filters out the articles filed under the other one.
    const [zone] = diagramZones([FRONT_LEFT, FRONT_LEFT_SYNONYM]);

    expect(zone.values).toEqual(["VL", "LV"]);
    expect(zone.count).toBe(1088 + 12);
  });

  it("reads front to back, whatever order the values arrived in", () => {
    const zones = diagramZones([REAR_AXLE, FRONT_LEFT, FRONT_AXLE]);

    expect(zones.map((entry) => entry.zone)).toEqual([
      "front-axle",
      "front-left",
      "rear-axle",
    ]);
  });

  it("answers with nothing when no value carries a zone", () => {
    expect(diagramZones([UNPLACEABLE])).toEqual([]);
  });
});

describe("<FittingPositionDiagram />", () => {
  it("draws only the zones the result set offers", () => {
    // The single-article case from the brief: three values, so three zones and
    // no dead hotspots for the positions this part is never fitted in.
    render(
      <FittingPositionDiagram
        state={stateWith()}
        criteriaId={FITTING_POSITION_ID}
        values={[FRONT_AXLE, REAR_AXLE, FRONT_LEFT]}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: /Предна ос \(34076\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Задна дясна/ }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing at all when no value can be placed", () => {
    const { container } = render(
      <FittingPositionDiagram
        state={stateWith()}
        criteriaId={FITTING_POSITION_ID}
        values={[UNPLACEABLE]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("applies every code behind a zone in one click", () => {
    render(
      <FittingPositionDiagram
        state={stateWith()}
        criteriaId={FITTING_POSITION_ID}
        values={[FRONT_LEFT, FRONT_LEFT_SYNONYM]}
      />,
    );

    const href =
      screen.getByRole("link", { name: /Предна лява/ }).getAttribute("href") ??
      "";

    expect(href).toContain("attr=100%3AVL");
    expect(href).toContain("attr=100%3ALV");
  });

  it("marks a zone selected when any of its codes is applied", () => {
    render(
      <FittingPositionDiagram
        state={stateWith([{ criteriaId: FITTING_POSITION_ID, value: "LV" }])}
        criteriaId={FITTING_POSITION_ID}
        values={[FRONT_LEFT, FRONT_LEFT_SYNONYM]}
      />,
    );

    const zone = screen.getByRole("link", { name: /Предна лява/ });

    expect(zone).toHaveAttribute("aria-pressed", "true");
    expect(zone.getAttribute("aria-label")).toContain("премахни филтъра");
  });

  it("clears the whole zone when it is already selected", () => {
    render(
      <FittingPositionDiagram
        state={stateWith([
          { criteriaId: FITTING_POSITION_ID, value: "VL" },
          { criteriaId: FITTING_POSITION_ID, value: "LV" },
        ])}
        criteriaId={FITTING_POSITION_ID}
        values={[FRONT_LEFT, FRONT_LEFT_SYNONYM]}
      />,
    );

    const href =
      screen.getByRole("link", { name: /Предна лява/ }).getAttribute("href") ??
      "";

    expect(href).not.toContain("attr=");
  });

  it("leaves another criterion's selection alone", () => {
    render(
      <FittingPositionDiagram
        state={stateWith([{ criteriaId: "467", value: "Правоъгълен" }])}
        criteriaId={FITTING_POSITION_ID}
        values={[FRONT_AXLE]}
      />,
    );

    const href =
      screen.getByRole("link", { name: /Предна ос/ }).getAttribute("href") ??
      "";

    expect(href).toContain("attr=467%3A");
    expect(href).toContain("attr=100%3AVA");
  });
});
