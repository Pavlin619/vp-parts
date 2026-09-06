"use client";

import { useQuery } from "@tanstack/react-query";
import { variantsQueryOptions } from "@/lib/api/catalog";
import { seriesPhotoUrlOf } from "@/lib/catalog/vehicle-series-photo";

/**
 * The series photo for a vehicle the store restored, fetched rather than saved
 * with it.
 *
 * The URL carries a token TecDoc mints per response with no documented life, so
 * a copy persisted beside the vehicle would be dead long before the vehicle was.
 * This reads the same variant list — and the same query key — the selector uses,
 * so a visitor who has just picked a car pays nothing for it.
 */
export function useSeriesPhoto(seriesId: string | null | undefined): string | null {
  const { data: variants } = useQuery({
    ...variantsQueryOptions(seriesId ?? ""),
    enabled: !!seriesId,
  });

  return variants ? seriesPhotoUrlOf(variants) : null;
}
