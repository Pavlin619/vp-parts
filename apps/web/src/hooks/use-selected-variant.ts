"use client";

import { useQuery } from "@tanstack/react-query";
import type { VehicleVariantDto } from "@vp-parts-shop/shared";
import { variantsQueryOptions } from "@/lib/api/catalog";
import type { SelectedVehicle } from "@/hooks/use-vehicle-context";

/**
 * The full catalogue record for the vehicle the store holds.
 *
 * The store keeps only what names a car in a line of text; body type, KBA
 * numbers and displacement are not in it. This reads the same variant list —
 * and the same query key — the selector and {@link useSeriesPhoto} use, so a
 * surface that already shows the photo pays nothing for the rest of the sheet.
 *
 * Null until the list arrives, so a caller renders what the store already knows
 * rather than a row of dashes.
 */
export function useSelectedVariant(
  vehicle: SelectedVehicle | null,
): VehicleVariantDto | null {
  const { data: variants } = useQuery({
    ...variantsQueryOptions(vehicle?.seriesId ?? ""),
    enabled: !!vehicle,
  });

  if (!vehicle || !variants) {
    return null;
  }

  return variants.find((variant) => variant.vehicleId === vehicle.vehicleId) ?? null;
}
