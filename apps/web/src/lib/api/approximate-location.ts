import { queryOptions } from "@tanstack/react-query";
import type { GeoPoint } from "@/lib/checkout/delivery/office-distance";

/** A guess, so any failure answers no location rather than an error. */
export async function getApproximateLocation(): Promise<GeoPoint | null> {
  try {
    const response = await fetch("/api/approximate-location");

    return response.ok ? ((await response.json()) as GeoPoint | null) : null;
  } catch {
    return null;
  }
}

export const approximateLocationQueryOptions = queryOptions({
  queryKey: ["geo", "approximate-location"] as const,
  queryFn: getApproximateLocation,
  staleTime: Infinity,
});
