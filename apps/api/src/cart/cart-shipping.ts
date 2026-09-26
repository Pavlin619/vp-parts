import type { ShippingProfile } from '../tecdoc';

/** How a {@link ShippingProfile} is stored on a `CartItem` row. */
export interface CartShippingColumns {
  weightGrams: number | null;
  packageLengthCm: number | null;
  packageWidthCm: number | null;
  packageHeightCm: number | null;
}

export function toShippingColumns({
  weightGrams,
  packageCm,
}: ShippingProfile): CartShippingColumns {
  return {
    weightGrams,
    packageLengthCm: packageCm?.length ?? null,
    packageWidthCm: packageCm?.width ?? null,
    packageHeightCm: packageCm?.height ?? null,
  };
}

export function fromShippingColumns(
  columns: CartShippingColumns,
): ShippingProfile {
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
  };
}
