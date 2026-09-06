"use client";

import { formatEngineCodes } from "@/lib/catalog/vehicle-specs";
import { useHydration, useVehicleContext } from "./use-vehicle-context";

/**
 * Resolves the vehicle name to show alongside the fit verdict. An explicit
 * `vehicleName` prop wins; otherwise it derives the label from the persisted
 * vehicle context. The article's fit verdict is server-driven, but the vehicle
 * *name* lives in a client store, so it is only attached after hydration to
 * avoid a server/client mismatch.
 */
export function useFitVehicleName(vehicleName?: string): string | undefined {
  const isHydrated = useHydration();
  const selectedVehicle = useVehicleContext((state) => state.selectedVehicle);

  if (vehicleName) {
    return vehicleName;
  }

  if (isHydrated && selectedVehicle) {
    const model = `${selectedVehicle.manufacturerName} ${selectedVehicle.seriesName}`;
    const engineCodes = formatEngineCodes(selectedVehicle.engineCodes);

    return engineCodes ? `${model} · ${engineCodes}` : model;
  }

  return undefined;
}
