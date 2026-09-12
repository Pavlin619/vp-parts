import type { SelectedVehicle } from "@/hooks/use-vehicle-context";

/**
 * The car the catalogue is answering for.
 *
 * Its absence is `null` rather than a missing field, because that is a scope of
 * its own — the catalogue-wide tree — and not a value the page is waiting for.
 * The id and the name travel together because both halves change at once: the
 * id picks the tree and scopes every search link out of it, the name is what
 * the counts are labelled with.
 */
export interface CategoryScope {
  vehicleId: string;
  vehicleName: string;
}

export function categoryScopeOf(
  vehicle: SelectedVehicle | null,
): CategoryScope | null {
  if (!vehicle) {
    return null;
  }

  return {
    vehicleId: vehicle.vehicleId,
    vehicleName: `${vehicle.manufacturerName} ${vehicle.seriesName}`,
  };
}
