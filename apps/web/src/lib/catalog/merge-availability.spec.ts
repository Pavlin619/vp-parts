import {
  mergeArticleAvailability,
  selectArticleAvailability,
  UNAVAILABLE_DETAIL,
} from "./merge-availability";
import type {
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
  WarehouseAvailabilityDto,
} from "@vp-parts-shop/shared";

const metadata: ArticleSummaryDto[] = [
  {
    articleNumber: "WL6340",
    brandName: "WIX",
    brandLogoUrl: null,
    description: "Oil Filter",
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
  },
  {
    articleNumber: "OC115",
    brandName: "MANN-FILTER",
    brandLogoUrl: null,
    description: "Oil Filter",
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
  },
];

const warehouse: WarehouseAvailabilityDto = {
  warehouseId: "CENTRAL",
  quantity: 6,
  deliveryWorkDays: 0,
  orderCutoffTime: "18:00",
  cutoffAt: "2026-07-05T15:00:00.000Z",
  pickup: { granularity: "HOUR", earliestAt: "2026-07-05T12:00:00.000Z" },
  courier: { granularity: "DAY", earliestAt: "2026-07-06T06:00:00.000Z" },
};

describe("mergeArticleAvailability", () => {
  it("attaches the matching availability entry onto each metadata row", () => {
    const availability: ArticlesAvailabilityDto = {
      WL6340: {
        available: true,
        bestPriceExVat: 1250,
        bestPriceIncVat: 1500,
        availabilityByWarehouse: [warehouse],
        computedAt: "2026-07-05T09:00:00.000Z",
      },
      OC115: {
        available: true,
        bestPriceExVat: 900,
        bestPriceIncVat: 1080,
        availabilityByWarehouse: [warehouse],
        computedAt: "2026-07-05T09:00:00.000Z",
      },
    };

    const result = mergeArticleAvailability(metadata, availability);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      ...metadata[0],
      available: true,
      bestPriceExVat: 1250,
      bestPriceIncVat: 1500,
      availabilityByWarehouse: [warehouse],
      computedAt: "2026-07-05T09:00:00.000Z",
    });
  });

  it("degrades a row with no availability entry to the neutral unavailable state", () => {
    const result = mergeArticleAvailability(metadata, {});

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      ...metadata[1],
      available: false,
      bestPriceExVat: null,
      bestPriceIncVat: null,
      availabilityByWarehouse: [],
      computedAt: null,
    });
  });

  it("preserves the metadata order regardless of the availability map order", () => {
    const availability: ArticlesAvailabilityDto = {
      OC115: {
        available: true,
        bestPriceExVat: 900,
        bestPriceIncVat: 1080,
        availabilityByWarehouse: [],
        computedAt: null,
      },
    };

    const result = mergeArticleAvailability(metadata, availability);

    expect(result.map((item) => item.articleNumber)).toEqual([
      "WL6340",
      "OC115",
    ]);
  });
});

describe("selectArticleAvailability", () => {
  const availability: ArticlesAvailabilityDto = {
    WL6340: {
      available: true,
      bestPriceExVat: 1250,
      bestPriceIncVat: 1500,
      availabilityByWarehouse: [],
      computedAt: null,
    },
  };

  it("returns the article's detail when the read has a row for it", () => {
    expect(selectArticleAvailability(availability, "WL6340")).toEqual(
      availability.WL6340,
    );
  });

  it("degrades a number the read had no row for to the neutral detail", () => {
    expect(selectArticleAvailability(availability, "OC115")).toEqual(
      UNAVAILABLE_DETAIL,
    );
  });

  it("carries the pending state through so the row can skeleton", () => {
    expect(selectArticleAvailability(undefined, "WL6340")).toBeUndefined();
  });

  it("carries the failed state through so the row can show 'unknown'", () => {
    expect(selectArticleAvailability(null, "WL6340")).toBeNull();
  });
});
