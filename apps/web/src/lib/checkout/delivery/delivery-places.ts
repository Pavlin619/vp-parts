import type { DeliveryOfficeDto, DeliveryPlaceDto } from "@vp-parts-shop/shared";
import { distanceInMeters, sortOfficesByDistance, type GeoPoint } from "./office-distance";

/** Covers the next town for a village, without pulling in a neighbouring city. */
const NEARBY_RADIUS_METERS = 15_000;
const MAX_PLACE_SUGGESTIONS = 8;
const POST_CODE_QUERY = /^\d+$/;

export interface PlaceQuery {
  query: string;
  region: string | null;
}

export interface OfficeScope {
  place: DeliveryPlaceDto | null;
  reference: GeoPoint | null;
}

export function regionsOf(places: DeliveryPlaceDto[]): string[] {
  return [...new Set(places.map(({ region }) => region))].sort((first, second) =>
    first.localeCompare(second, "bg"),
  );
}

/** Places whose name starts with the query come first, and towns with an office before villages. */
export function suggestPlaces(
  places: DeliveryPlaceDto[],
  { query, region }: PlaceQuery,
): DeliveryPlaceDto[] {
  const needle = normalize(query);
  if (needle === "") {
    return [];
  }

  const candidates = places.filter((place) => region === null || place.region === region);

  if (POST_CODE_QUERY.test(needle)) {
    return candidates
      .filter(({ postCode }) => postCode.startsWith(needle))
      .slice(0, MAX_PLACE_SUGGESTIONS);
  }

  return candidates
    .flatMap((place) => {
      const rank = nameRank(normalize(place.name), needle);

      return rank === null ? [] : [{ place, rank }];
    })
    .sort(
      (first, second) =>
        first.rank - second.rank ||
        Number(hasOwnOffice(second.place)) - Number(hasOwnOffice(first.place)),
    )
    .slice(0, MAX_PLACE_SUGGESTIONS)
    .map(({ place }) => place);
}

/** The middle of a place's own offices, or a village's serving office; places carry no coordinates. */
export function placePoint(
  place: DeliveryPlaceDto,
  offices: DeliveryOfficeDto[],
): GeoPoint | null {
  const own = offices.filter(({ placeId }) => placeId === place.id);

  if (own.length > 0) {
    return {
      latitude: average(own.map(({ latitude }) => latitude)),
      longitude: average(own.map(({ longitude }) => longitude)),
    };
  }

  const serving = offices.find(({ code }) => code === place.servingOfficeCode);

  return serving ? { latitude: serving.latitude, longitude: serving.longitude } : null;
}

export function placeOfOffice(
  places: DeliveryPlaceDto[],
  office: DeliveryOfficeDto,
): DeliveryPlaceDto | null {
  return places.find(({ id }) => id === office.placeId) ?? null;
}

/**
 * A place's own offices, the office serving a village, and any office close to the
 * point, nearest first. A village's nearest office is usually in the next town.
 */
export function nearbyOffices(
  offices: DeliveryOfficeDto[],
  { place, reference }: OfficeScope,
): DeliveryOfficeDto[] {
  const inScope = offices.filter(
    (office) =>
      (place !== null && belongsTo(office, place)) ||
      (reference !== null && distanceInMeters(reference, office) <= NEARBY_RADIUS_METERS),
  );

  return reference ? sortOfficesByDistance(inScope, reference) : inScope;
}

function belongsTo(office: DeliveryOfficeDto, place: DeliveryPlaceDto): boolean {
  return office.placeId === place.id || office.code === place.servingOfficeCode;
}

function hasOwnOffice(place: DeliveryPlaceDto): boolean {
  return place.servingOfficeCode === null;
}

function nameRank(name: string, needle: string): number | null {
  if (name.startsWith(needle)) {
    return 0;
  }

  return name.includes(needle) ? 1 : null;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("bg");
}
