import type { PackageSizeCm, ShippingProfile } from '../../tecdoc';

export interface ProductTypeProfile extends ShippingProfile {
  weightGrams: number;
  sampleSize: number;
}

/** A spread beyond this p75/p25 ratio makes the median too light to quote on. */
const WIDE_SPREAD_RATIO = 2;
/** Below this many samples a spread says nothing about the type. */
const MIN_SAMPLES_FOR_SPREAD = 4;

const MEDIAN = 0.5;
const LOWER_QUARTILE = 0.25;
const UPPER_QUARTILE = 0.75;

/**
 * What a product type typically weighs and packs into, from parts of that type
 * the catalogue has measured. One sample is enough: a weighed part of the same
 * type is closer than any default. Null when none of them has a weight.
 */
export function aggregateProductTypeProfile(
  samples: ShippingProfile[],
): ProductTypeProfile | null {
  const weights = samples
    .map((sample) => sample.weightGrams)
    .filter((grams): grams is number => grams !== null);

  if (weights.length === 0) {
    return null;
  }

  return {
    weightGrams: typicalWeight(weights),
    packageCm: medianBox(samples),
    sampleSize: weights.length,
  };
}

/** The p75 for a wide type, so the quote errs high rather than low. */
function typicalWeight(weights: number[]): number {
  const isWide =
    weights.length >= MIN_SAMPLES_FOR_SPREAD &&
    quantile(weights, UPPER_QUARTILE) >
      WIDE_SPREAD_RATIO * quantile(weights, LOWER_QUARTILE);

  return Math.round(
    isWide ? quantile(weights, UPPER_QUARTILE) : quantile(weights, MEDIAN),
  );
}

/** Each box is sorted longest side first, so the same dimension is compared across samples. */
function medianBox(samples: ShippingProfile[]): PackageSizeCm | null {
  const boxes = samples
    .map((sample) => sample.packageCm)
    .filter((box): box is PackageSizeCm => box !== null)
    .map(({ length, width, height }) =>
      [length, width, height].sort(byLargest),
    );

  if (boxes.length === 0) {
    return null;
  }

  const [length, width, height] = [0, 1, 2].map((side) =>
    quantile(
      boxes.map((box) => box[side]),
      MEDIAN,
    ),
  );

  return { length, width, height };
}

function byLargest(a: number, b: number): number {
  return b - a;
}

/** Linear interpolation between the two nearest ranks, so the median of an even count is the mean of the middle pair. */
export function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
