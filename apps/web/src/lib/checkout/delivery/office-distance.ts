import type { DeliveryOfficeDto } from "@vp-parts-shop/shared";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** The point the office list is sorted and measured from, and what the customer is told it is. */
export interface ReferencePoint extends GeoPoint {
  kind: "place" | "chosen-office" | "device";
  /** Completes "Близо до …". */
  label: string;
}

const EARTH_RADIUS_METERS = 6_371_000;
const KILOMETER = 1_000;
const NON_BREAKING_SPACE = " ";

const kilometerFormat = new Intl.NumberFormat("bg-BG", { maximumFractionDigits: 1 });
const wholeKilometerFormat = new Intl.NumberFormat("bg-BG", { maximumFractionDigits: 0 });

/** Straight-line (haversine) distance; no one reads the offices by driving distance. */
export function distanceInMeters(from: GeoPoint, to: GeoPoint): number {
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const latitudeDelta = toLatitude - fromLatitude;
  const longitudeDelta = toRadians(to.longitude - from.longitude);

  const halfChord =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(halfChord));
}

export function sortOfficesByDistance(
  offices: DeliveryOfficeDto[],
  from: GeoPoint,
): DeliveryOfficeDto[] {
  return offices
    .map((office) => ({ office, distance: distanceInMeters(from, office) }))
    .sort((first, second) => first.distance - second.distance)
    .map(({ office }) => office);
}

export function formatDistance(meters: number): string {
  const roundedMeters = Math.round(meters / 10) * 10;

  if (roundedMeters < KILOMETER) {
    return `${roundedMeters}${NON_BREAKING_SPACE}м`;
  }

  const kilometers = meters / KILOMETER;
  const format = kilometers < 10 ? kilometerFormat : wholeKilometerFormat;

  return `${format.format(kilometers)}${NON_BREAKING_SPACE}км`;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
