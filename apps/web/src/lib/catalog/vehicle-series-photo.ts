import type { VehicleVariantDto } from "@vp-parts-shop/shared";

/** The asset TecDoc serves, measured identical on every series sampled. */
export const SERIES_PHOTO_WIDTH = 800;
export const SERIES_PHOTO_HEIGHT = 287;

/**
 * The photo for a model series, read across its variants rather than off one of
 * them.
 *
 * TecDoc files the photo as a property of the series but sends it on vehicle
 * records, and leaves it off some of them entirely — a Hyundai KONA carries it
 * on 1 of 22. Taking the first available one shows the car the moment a model is
 * picked and covers the siblings that have none.
 */
export function seriesPhotoUrlOf(variants: VehicleVariantDto[]): string | null {
  return variants.find((variant) => variant.imageUrl)?.imageUrl ?? null;
}
