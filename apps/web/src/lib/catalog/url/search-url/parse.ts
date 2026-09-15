import {
  DEFAULT_SEARCH_MODE,
  DEFAULT_SEARCH_SORT,
  isSearchMode,
  isSearchSort,
  isStockScope,
  type AttributeSelectionDto,
  type SearchMode,
  type SearchSort,
  type StockScope,
} from "@vp-parts-shop/shared";
import { FIRST_PAGE, SEARCH_PARAM, type SearchUrlState } from "./state";

/** Mirrors the API's `SEARCH_MAX_FILTER_VALUES`, which rejects longer lists. */
const MAX_FILTER_VALUES = 50;

type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

export function parseSearchUrl(input: SearchParamsInput): SearchUrlState {
  const read = reader(input);
  const categoryPath = read.all(SEARCH_PARAM.category).slice(0, MAX_FILTER_VALUES);

  return {
    query: (read.one(SEARCH_PARAM.query) ?? "").trim(),
    vehicleId: read.one(SEARCH_PARAM.vehicleId) || undefined,
    page: parsePage(read.one(SEARCH_PARAM.page)),
    mode: parseMode(read.one(SEARCH_PARAM.mode)),
    brandIds: read.all(SEARCH_PARAM.brand).slice(0, MAX_FILTER_VALUES),
    productTypeId: read.one(SEARCH_PARAM.productType) || undefined,
    categoryPath,
    categoryHasChildren: parseCategoryHasChildren(
      read.one(SEARCH_PARAM.categoryHasChildren),
      categoryPath,
    ),
    attributes: parseAttributes(read.all(SEARCH_PARAM.attribute)),
    stockScope: parseStockScope(read.one(SEARCH_PARAM.stock)),
    sort: parseSort(read.one(SEARCH_PARAM.sort)),
  };
}

interface ParamReader {
  one: (key: string) => string | undefined;
  all: (key: string) => string[];
}

function reader(input: SearchParamsInput): ParamReader {
  if (input instanceof URLSearchParams) {
    return {
      one: (key) => input.get(key) ?? undefined,
      all: (key) => input.getAll(key).filter(Boolean),
    };
  }

  return {
    one: (key) => {
      const value = input[key];
      return Array.isArray(value) ? value[0] : value;
    },
    all: (key) => {
      const value = input[key];
      if (value === undefined) {
        return [];
      }
      return (Array.isArray(value) ? value : [value]).filter(Boolean);
    },
  };
}

function parsePage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= FIRST_PAGE ? page : FIRST_PAGE;
}

function parseMode(raw: string | undefined): SearchMode {
  return isSearchMode(raw) ? raw : DEFAULT_SEARCH_MODE;
}

/**
 * Dropped rather than forwarded when it is not an origin we know, because the
 * API rejects one it does not recognise — and a hand-edited URL should widen
 * the search back to everything, not 400 it.
 */
function parseStockScope(raw: string | undefined): StockScope | undefined {
  return isStockScope(raw) ? raw : undefined;
}

/** Falls back to the default for the same reason a bad `stock` is dropped. */
function parseSort(raw: string | undefined): SearchSort {
  return isSearchSort(raw) ? raw : DEFAULT_SEARCH_SORT;
}

/**
 * Only an explicit `false` opts into the dimension facets, so anything else —
 * absent, misspelled, or describing a category that is no longer selected —
 * resolves to "unknown" rather than to a boolean the API would act on.
 */
function parseCategoryHasChildren(
  raw: string | undefined,
  categoryPath: string[],
): boolean | undefined {
  if (categoryPath.length === 0) {
    return undefined;
  }

  if (raw === "true") {
    return true;
  }

  return raw === "false" ? false : undefined;
}

/**
 * Splits each `criteriaId:value` pair on the FIRST colon so a value may contain
 * colons of its own, mirroring the API's own parser. A malformed entry is
 * dropped rather than throwing: these come from a facet block we served, so a
 * broken one means a hand-edited URL, not a search worth failing.
 */
function parseAttributes(raw: string[]): AttributeSelectionDto[] {
  return raw.slice(0, MAX_FILTER_VALUES).reduce<AttributeSelectionDto[]>(
    (selections, entry) => {
      const separatorIndex = entry.indexOf(":");
      const criteriaId = entry.slice(0, separatorIndex);
      const value = entry.slice(separatorIndex + 1);

      if (separatorIndex > 0 && value.length > 0) {
        selections.push({ criteriaId, value });
      }

      return selections;
    },
    [],
  );
}
