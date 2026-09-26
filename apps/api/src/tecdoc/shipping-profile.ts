import type { TecDocArticleRecord } from './article-mapper';

export interface PackageSizeCm {
  length: number;
  width: number;
  height: number;
}

/** What TecDoc says about a part's weight and packaging. Either half may be unknown. */
export interface ShippingProfile {
  weightGrams: number | null;
  packageCm: PackageSizeCm | null;
}

/**
 * Weight criteria in the order they are trusted, with the factor to grams. The
 * measured ids and their coverage are in docs/DELIVERY-PROVIDERS.md.
 */
const WEIGHT_CRITERIA: ReadonlyArray<
  [criteriaId: number, gramsPerUnit: number]
> = [
  [3852, 1],
  [683, 1],
  [2612, 1000],
  [212, 1000],
];

const PACKAGE_LENGTH_CRITERION = 1620;
const PACKAGE_WIDTH_CRITERION = 1621;
const PACKAGE_HEIGHT_CRITERION = 1622;

export function shippingProfileOf(
  article: TecDocArticleRecord,
): ShippingProfile {
  const values = numericCriteriaOf(article);

  return {
    weightGrams: weightGramsOf(values),
    packageCm: packageSizeOf(values),
  };
}

function weightGramsOf(values: Map<number, number>): number | null {
  for (const [criteriaId, gramsPerUnit] of WEIGHT_CRITERIA) {
    const value = values.get(criteriaId);

    if (value !== undefined) {
      return Math.ceil(value * gramsPerUnit);
    }
  }

  return null;
}

function packageSizeOf(values: Map<number, number>): PackageSizeCm | null {
  const length = values.get(PACKAGE_LENGTH_CRITERION);
  const width = values.get(PACKAGE_WIDTH_CRITERION);
  const height = values.get(PACKAGE_HEIGHT_CRITERION);

  if (length === undefined || width === undefined || height === undefined) {
    return null;
  }

  return { length, width, height };
}

/** Criterion id → its positive value, read from the raw value: `formattedValue` is for display and may carry a unit. */
function numericCriteriaOf(article: TecDocArticleRecord): Map<number, number> {
  const values = new Map<number, number>();

  for (const criterion of article.articleCriteria ?? []) {
    const value = parsePositiveNumber(criterion.rawValue);

    if (criterion.criteriaId !== undefined && value !== null) {
      values.set(criterion.criteriaId, value);
    }
  }

  return values;
}

function parsePositiveNumber(rawValue: string): number | null {
  const isBareNumber = /^\d+(?:[.,]\d+)?$/.test(rawValue.trim());
  const value = isBareNumber ? Number(rawValue.trim().replace(',', '.')) : NaN;

  return value > 0 ? value : null;
}
