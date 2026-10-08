import type { ArticleIdentityDto } from '@vp-parts-shop/shared';
import type { ResolvedShippingProfile } from '../../cart';
import type { PackageSizeCm } from '../../tecdoc';

export interface ParcelLine {
  article: ArticleIdentityDto;
  quantity: number;
  shippingProfile: ResolvedShippingProfile;
}

export interface Parcel {
  /** One entry per physical unit; null when any unit's box is unknown. */
  unitsCm: PackageSizeCm[] | null;
  weightGrams: number;
  /** True when any line's weight or box was estimated rather than measured. */
  hasEstimatedUnits: boolean;
}

export function estimateParcel(lines: ParcelLine[]): Parcel {
  return {
    weightGrams: totalWeightGrams(lines),
    unitsCm: unitSizes(lines),
    hasEstimatedUnits: lines.some((line) => line.shippingProfile.isEstimated),
  };
}

/** The parcel's outer box, known only for a single unit; several units' packing is not. */
export function singleBoxOf({ unitsCm }: Parcel): PackageSizeCm | null {
  return unitsCm?.length === 1 ? unitsCm[0] : null;
}

function totalWeightGrams(lines: ParcelLine[]): number {
  return lines.reduce(
    (sum, { quantity, shippingProfile }) =>
      sum + (shippingProfile.weightGrams ?? 0) * quantity,
    0,
  );
}

function unitSizes(lines: ParcelLine[]): PackageSizeCm[] | null {
  const units: PackageSizeCm[] = [];

  for (const { quantity, shippingProfile } of lines) {
    if (shippingProfile.packageCm === null) {
      return null;
    }

    units.push(
      ...Array<PackageSizeCm>(quantity).fill(shippingProfile.packageCm),
    );
  }

  return units;
}
