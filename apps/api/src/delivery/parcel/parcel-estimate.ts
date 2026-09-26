import type { ArticleIdentityDto } from '@vp-parts-shop/shared';
import type { PackageSizeCm, ShippingProfile } from '../../tecdoc';

export interface ParcelLine {
  article: ArticleIdentityDto;
  quantity: number;
  shippingProfile: ShippingProfile;
}

export interface Parcel {
  /** One entry per physical unit; null when any unit's box is unknown. */
  unitsCm: PackageSizeCm[] | null;
  weightGrams: number;
}

/** A parcel is weighed only from the parts' own data; one unknown part leaves it unweighed. */
export type ParcelEstimate =
  | { isMeasured: true; parcel: Parcel }
  | { isMeasured: false; unmeasuredArticles: ArticleIdentityDto[] };

export function estimateParcel(lines: ParcelLine[]): ParcelEstimate {
  const unmeasuredArticles = lines
    .filter((line) => line.shippingProfile.weightGrams === null)
    .map((line) => line.article);

  if (unmeasuredArticles.length > 0) {
    return { isMeasured: false, unmeasuredArticles };
  }

  return {
    isMeasured: true,
    parcel: {
      weightGrams: totalWeightGrams(lines),
      unitsCm: unitSizes(lines),
    },
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
