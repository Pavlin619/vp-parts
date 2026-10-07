import type { TecDocArticleRecord } from './article-mapper';

type TecDocNumericCriterion = { criteriaId?: number; rawValue: string };

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

const PACKAGE_BOX_CRITERIA = [1620, 1621, 1622] as const;

const LOGISTICS_WEIGHT_GRAMS_CRITERION = 3870;
const LOGISTICS_BOX_MM_CRITERIA = [4197, 4198, 4199] as const;
const CM_PER_MM = 0.1;

/**
 * The logistics table is the *packed* part and the article criteria mostly the
 * bare one, so each half is taken from logistics first.
 */
export function shippingProfileOf(
  article: TecDocArticleRecord,
): ShippingProfile {
  const criteria = numericCriteriaOf(article.articleCriteria);
  const logistics = numericCriteriaOf(article.articleLogisticsCriteria);

  return {
    weightGrams: logisticsWeightOf(logistics) ?? weightGramsOf(criteria),
    packageCm:
      packageSizeOf(logistics, LOGISTICS_BOX_MM_CRITERIA, CM_PER_MM) ??
      packageSizeOf(criteria, PACKAGE_BOX_CRITERIA, 1),
  };
}

function logisticsWeightOf(values: Map<number, number>): number | null {
  const grams = values.get(LOGISTICS_WEIGHT_GRAMS_CRITERION);

  return grams === undefined ? null : Math.ceil(grams);
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

function packageSizeOf(
  values: Map<number, number>,
  [lengthId, widthId, heightId]: readonly [number, number, number],
  cmPerUnit: number,
): PackageSizeCm | null {
  const length = values.get(lengthId);
  const width = values.get(widthId);
  const height = values.get(heightId);

  if (length === undefined || width === undefined || height === undefined) {
    return null;
  }

  return {
    length: toCm(length, cmPerUnit),
    width: toCm(width, cmPerUnit),
    height: toCm(height, cmPerUnit),
  };
}

/** Rounded to the hundredth so a millimetre reading carries no float noise. */
function toCm(value: number, cmPerUnit: number): number {
  return Math.round(value * cmPerUnit * 100) / 100;
}

/** Criterion id → its positive value, read from the raw value: `formattedValue` is for display and may carry a unit. */
function numericCriteriaOf(
  criteria: TecDocNumericCriterion[] = [],
): Map<number, number> {
  const values = new Map<number, number>();

  for (const criterion of criteria) {
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
