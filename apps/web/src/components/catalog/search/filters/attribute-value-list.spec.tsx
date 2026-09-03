import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DEFAULT_SEARCH_MODE,
  type AttributeFacetDto,
  type AttributeFacetValueDto,
} from "@vp-parts-shop/shared";
import { newSearch, type SearchUrlState } from "@/lib/catalog/search-url";
import { AttributeValueList } from "./attribute-value-list";

const COLLAPSED_LIMIT = 12;
const REVEAL_BATCH = 24;

const HEIGHT: AttributeFacetDto = {
  id: "20",
  label: "Височина",
  unit: "mm",
  type: "N",
  isInterval: false,
  isMandatory: true,
  role: null,
  values: [],
};

/** `count` descends so a pill is identifiable by its label alone. */
function heights(total: number): AttributeFacetValueDto[] {
  return Array.from({ length: total }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1),
    count: total - index,
  }));
}

function stateWith(
  attributes: SearchUrlState["attributes"] = [],
): SearchUrlState {
  return {
    ...newSearch({ query: "спирачен диск", mode: DEFAULT_SEARCH_MODE }),
    attributes,
  };
}

function renderList(
  values: AttributeFacetValueDto[],
  attributes: SearchUrlState["attributes"] = [],
) {
  return render(
    <AttributeValueList
      state={stateWith(attributes)}
      facet={HEIGHT}
      values={values}
    />,
  );
}

const pills = () => screen.getAllByRole("link");

describe("<AttributeValueList />", () => {
  it("renders a short criterion whole, with no control to expand it", () => {
    renderList(heights(6));

    expect(pills()).toHaveLength(6);
    expect(
      screen.queryByRole("button", { name: /Покажи още/ }),
    ).not.toBeInTheDocument();
  });

  it("renders exactly the cap when the criterion is one value longer", () => {
    renderList(heights(COLLAPSED_LIMIT + 1));

    expect(pills()).toHaveLength(COLLAPSED_LIMIT);
  });

  it("names how many are left, and how many the next click adds", () => {
    renderList(heights(60));

    expect(
      screen.getByRole("button", {
        name: `Покажи още ${REVEAL_BATCH} от ${60 - COLLAPSED_LIMIT}`,
      }),
    ).toBeInTheDocument();
  });

  it("names only the remainder when it fits in one reveal", () => {
    renderList(heights(COLLAPSED_LIMIT + 5));

    expect(
      screen.getByRole("button", { name: "Покажи още 5" }),
    ).toBeInTheDocument();
  });

  it("reaches the whole 60-value ceiling in two reveals", async () => {
    const user = userEvent.setup();
    renderList(heights(60));

    await user.click(screen.getByRole("button", { name: /Покажи още/ }));
    expect(pills()).toHaveLength(COLLAPSED_LIMIT + REVEAL_BATCH);

    await user.click(screen.getByRole("button", { name: /Покажи още/ }));
    expect(pills()).toHaveLength(60);
    expect(
      screen.queryByRole("button", { name: /Покажи още/ }),
    ).not.toBeInTheDocument();
  });

  it("collapses back to the cap", async () => {
    const user = userEvent.setup();
    renderList(heights(60));

    await user.click(screen.getByRole("button", { name: /Покажи още/ }));
    await user.click(screen.getByRole("button", { name: "Покажи по-малко" }));

    expect(pills()).toHaveLength(COLLAPSED_LIMIT);
  });

  it("offers no way to collapse a list that was never expanded", () => {
    renderList(heights(60));

    expect(
      screen.queryByRole("button", { name: "Покажи по-малко" }),
    ).not.toBeInTheDocument();
  });

  // A filter the visitor cannot see is a filter they cannot remove, and the
  // API's own cap keeps a selection in the payload for the same reason.
  it("keeps a selected value visible from beyond the cap", () => {
    renderList(heights(60), [{ criteriaId: "20", value: "58" }]);

    expect(screen.getByRole("link", { name: /Височина 58/ })).toBeVisible();
    expect(pills()).toHaveLength(COLLAPSED_LIMIT + 1);
  });

  it("does not count a surfaced selection as one of the hidden", () => {
    renderList(heights(60), [{ criteriaId: "20", value: "58" }]);

    expect(
      screen.getByRole("button", {
        name: `Покажи още ${REVEAL_BATCH} от ${60 - COLLAPSED_LIMIT - 1}`,
      }),
    ).toBeInTheDocument();
  });

  it("ignores a selection filed under another criterion", () => {
    renderList(heights(60), [{ criteriaId: "21", value: "58" }]);

    expect(pills()).toHaveLength(COLLAPSED_LIMIT);
  });

  it("renders nothing when the criterion has no values left to offer", () => {
    const { container } = renderList([]);

    expect(container).toBeEmptyDOMElement();
  });

  // A measurement is served up its scale, so the values a visitor actually
  // wants are wherever the common sizes fall — not at the low end.
  describe("a measurement whose popular sizes are not first", () => {
    /** Labels ascend; the counts ascend with them, as on a real bolt circle. */
    function scale(total: number): AttributeFacetValueDto[] {
      return Array.from({ length: total }, (_, index) => ({
        value: String(index + 1),
        label: String(index + 1),
        count: index + 1,
      }));
    }

    const labelsOf = () => pills().map((pill) => pill.textContent?.trim());

    it("opens on the most-matched values, not the first ones served", () => {
      renderList(scale(20));

      expect(labelsOf()).toEqual([
        "9 (9)",
        "10 (10)",
        "11 (11)",
        "12 (12)",
        "13 (13)",
        "14 (14)",
        "15 (15)",
        "16 (16)",
        "17 (17)",
        "18 (18)",
        "19 (19)",
        "20 (20)",
      ]);
    });

    it("still reads up the scale, in the order the API served", () => {
      renderList(scale(20));

      const shown = labelsOf().map((label) => Number.parseInt(label ?? "", 10));

      expect(shown).toEqual([...shown].sort((left, right) => left - right));
    });

    it("reveals the rest into their place on the scale", async () => {
      const user = userEvent.setup();
      renderList(scale(20));

      await user.click(screen.getByRole("button", { name: /Покажи още/ }));
      const shown = labelsOf().map((label) => Number.parseInt(label ?? "", 10));

      expect(shown).toHaveLength(20);
      expect(shown[0]).toBe(1);
      expect(shown).toEqual([...shown].sort((left, right) => left - right));
    });

    it("surfaces a selected size from outside the window, in its place", () => {
      renderList(scale(20), [{ criteriaId: "20", value: "2" }]);

      const shown = labelsOf().map((label) => Number.parseInt(label ?? "", 10));

      expect(shown).toHaveLength(COLLAPSED_LIMIT + 1);
      expect(shown[0]).toBe(2);
    });
  });
});
