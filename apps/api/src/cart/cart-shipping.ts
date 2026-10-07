import type { ShippingProfile } from '../tecdoc';

/** A line's profile, and whether any half of it was estimated rather than measured. */
export interface ResolvedShippingProfile extends ShippingProfile {
  isEstimated: boolean;
}

/** How a {@link ResolvedShippingProfile} is stored on a `CartItem` row. */
export interface CartShippingColumns {
  weightGrams: number | null;
  packageLengthCm: number | null;
  packageWidthCm: number | null;
  packageHeightCm: number | null;
  isShippingEstimated: boolean;
}

export function toShippingColumns({
  weightGrams,
  packageCm,
  isEstimated,
}: ResolvedShippingProfile): CartShippingColumns {
  return {
    weightGrams,
    packageLengthCm: packageCm?.length ?? null,
    packageWidthCm: packageCm?.width ?? null,
    packageHeightCm: packageCm?.height ?? null,
    isShippingEstimated: isEstimated,
  };
}

export function fromShippingColumns(
  columns: CartShippingColumns,
): ResolvedShippingProfile {
  const { packageLengthCm, packageWidthCm, packageHeightCm } = columns;
  const isBoxed =
    packageLengthCm !== null &&
    packageWidthCm !== null &&
    packageHeightCm !== null;

  return {
    weightGrams: columns.weightGrams,
    packageCm: isBoxed
      ? {
          length: packageLengthCm,
          width: packageWidthCm,
          height: packageHeightCm,
        }
      : null,
    isEstimated: columns.isShippingEstimated,
  };
}

export function isFullyMeasured({
  weightGrams,
  packageCm,
}: ShippingProfile): boolean {
  return weightGrams !== null && packageCm !== null;
}

/** Each half is taken from `preferred` when it has it, else from `fallback`. */
export function preferMeasured(
  preferred: ShippingProfile,
  fallback: ShippingProfile,
): ShippingProfile {
  return {
    weightGrams: preferred.weightGrams ?? fallback.weightGrams,
    packageCm: preferred.packageCm ?? fallback.packageCm,
  };
}
