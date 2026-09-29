import type { GeoPoint } from "./office-distance";

type HeaderReader = Pick<Headers, "get">;

/**
 * Where Vercel's geo database puts the request, from the headers it sets on every
 * request. Only in Bulgaria, and only with a city: without one the database answers
 * the middle of the country.
 */
export function approximateLocationOf(headers: HeaderReader): GeoPoint | null {
  if (headers.get("x-vercel-ip-country") !== "BG" || !headers.get("x-vercel-ip-city")) {
    return null;
  }

  const latitude = coordinateOf(headers.get("x-vercel-ip-latitude"));
  const longitude = coordinateOf(headers.get("x-vercel-ip-longitude"));

  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function coordinateOf(value: string | null): number | null {
  const coordinate = value ? Number(value) : Number.NaN;

  return Number.isFinite(coordinate) ? coordinate : null;
}
