import type { PackageSizeCm, ShippingProfile } from '../../tecdoc';

/**
 * The median weight and box of the parts that replace this one, or null when
 * none of them is weighed. The median keeps an odd equivalent (a two-pack, a
 * typo) from pulling the estimate; the measurements are in
 * docs/DELIVERY-PROVIDERS.md.
 */
export function estimateFromEquivalents(
  profiles: ShippingProfile[],
): ShippingProfile | null {
  const weighed = profiles.filter((profile) => profile.weightGrams !== null);

  if (weighed.length === 0) {
    return null;
  }

  return {
    weightGrams: Math.ceil(
      median(weighed.map((profile) => profile.weightGrams as number)),
    ),
    packageCm: medianBoxOf(weighed),
  };
}

function medianBoxOf(profiles: ShippingProfile[]): PackageSizeCm | null {
  const boxes = profiles
    .map((profile) => profile.packageCm)
    .filter((box): box is PackageSizeCm => box !== null)
    .map(sidesLongestFirst);

  if (boxes.length === 0) {
    return null;
  }

  const [length, width, height] = [0, 1, 2].map((side) =>
    median(boxes.map((sides) => sides[side])),
  );

  return { length, width, height };
}

function sidesLongestFirst({ length, width, height }: PackageSizeCm): number[] {
  return [length, width, height].sort((a, b) => b - a);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
