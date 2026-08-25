import {
  mergeArticleAvailability,
  selectArticleAvailability,
  UNAVAILABLE_DETAIL,
} from "./merge-availability";
import { articleIdentityKey } from "@vp-parts-shop/shared";
import type {
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
  WarehouseAvailabilityDto,
} from "@vp-parts-shop/shared";

const WIX = "268";
const MANN = "72";

const metadata: ArticleSummaryDto[] = [
  {
    articleNumber: "WL6340",
    brandId: WIX,
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
    brandId: MANN,
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
      [articleIdentityKey(WIX, "WL6340")]: {
        available: true,
        bestPriceExVat: 1250,
        bestPriceIncVat: 1500,
        availabilityByWarehouse: [warehouse],
        computedAt: "2026-07-05T09:00:00.000Z",
      },
      [articleIdentityKey(MANN, "OC115")]: {
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

  // The same number under another data supplier is another part, so its price
  // must not land on this row.
  it("does not attach an entry another brand filed under the same number", () => {
    const availability: ArticlesAvailabilityDto = {
      [articleIdentityKey(MANN, "WL6340")]: {
        available: true,
        bestPriceExVat: 1250,
        bestPriceIncVat: 1500,
        availabilityByWarehouse: [warehouse],
        computedAt: "2026-07-05T09:00:00.000Z",
      },
    };

    const [wix] = mergeArticleAvailability(metadata, availability);

    expect(wix.available).toBe(false);
    expect(wix.bestPriceIncVat).toBeNull();
  });

  it("preserves the metadata order regardless of the availability map order", () => {
    const availability: ArticlesAvailabilityDto = {
      [articleIdentityKey(MANN, "OC115")]: {
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
  const wixFilter = { brandId: WIX, articleNumber: "WL6340" };
  const detail = {
    available: true,
    bestPriceExVat: 1250,
    bestPriceIncVat: 1500,
    availabilityByWarehouse: [],
    computedAt: null,
  };
  const availability: ArticlesAvailabilityDto = {
    [articleIdentityKey(WIX, "WL6340")]: detail,
  };

  it("returns the article's detail when the read has a row for it", () => {
    expect(selectArticleAvailability(availability, wixFilter)).toEqual(detail);
  });

  it("degrades an article the read had no row for to the neutral detail", () => {
    expect(
      selectArticleAvailability(availability, {
        brandId: MANN,
        articleNumber: "OC115",
      }),
    ).toEqual(UNAVAILABLE_DETAIL);
  });

  it("does not return an entry another brand filed under the same number", () => {
    expect(
      selectArticleAvailability(availability, {
        brandId: MANN,
        articleNumber: "WL6340",
      }),
    ).toEqual(UNAVAILABLE_DETAIL);
  });

  it("carries the pending state through so the row can skeleton", () => {
    expect(selectArticleAvailability(undefined, wixFilter)).toBeUndefined();
  });

  it("carries the failed state through so the row can show 'unknown'", () => {
    expect(selectArticleAvailability(null, wixFilter)).toBeNull();
  });
});
