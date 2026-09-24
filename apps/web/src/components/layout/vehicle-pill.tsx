"use client";

import { X, Car } from "lucide-react";
import { VehicleMakeBadge } from "@/components/catalog/vehicle-make-badge";
import { useVehicleContext, type SelectedVehicle } from "@/hooks/use-vehicle-context";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import {
  formatEngineCodes,
  formatPower,
  formatYearRange,
} from "@/lib/catalog/display/vehicle-specs";

interface VehiclePillProps {
  onOpenSelector: () => void;
}

/**
 * Assembled from the parts that have an answer rather than interpolated, so a
 * car TecDoc files no engine code for does not lead with a bare separator.
 */
function vehicleSummaryOf(vehicle: SelectedVehicle): string {
  return [
    formatEngineCodes(vehicle.engineCodes),
    formatPower(vehicle.powerKw, vehicle.powerHp),
    formatYearRange(vehicle.yearFrom, vehicle.yearTo),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function VehiclePill({ onOpenSelector }: VehiclePillProps) {
  const isHydrated = useIsHydrated();
  const selectedVehicle = useVehicleContext((state) => state.selectedVehicle);
  const clearVehicle = useVehicleContext((state) => state.clearVehicle);

  if (!isHydrated) {
    return (
      <div
        className="h-10 w-10 rounded-lg bg-ink/20 animate-pulse lg:w-40"
        aria-hidden="true"
      />
    );
  }

  if (!selectedVehicle) {
    return (
      <button
        onClick={onOpenSelector}
        className="flex h-10 flex-shrink-0 items-center gap-2 rounded-lg bg-ink px-2.5 text-sm font-medium text-white transition-colors hover:bg-ink/90 lg:px-4"
        aria-label="Избери автомобил"
      >
        <Car className="w-4 h-4" aria-hidden="true" />
        <span className="hidden lg:inline">Избери автомобил</span>
      </button>
    );
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-ink px-2 py-1.5 lg:gap-3 lg:px-3 lg:py-2">
      <button
        onClick={onOpenSelector}
        className="flex items-center gap-3 text-left"
        aria-label="Промени избрания автомобил"
      >
        <VehicleMakeBadge
          manufacturerId={selectedVehicle.manufacturerId}
          className="h-8 w-8 rounded-lg"
        />
        <span className="hidden flex-col items-start leading-none lg:flex">
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            {selectedVehicle.manufacturerName} · {selectedVehicle.seriesName}
          </span>
          {/* Capped and truncated because the engine codes are a list: a car
              built with seven of them would otherwise widen the header. */}
          <span className="text-[11px] text-white/60 mt-0.5 max-w-64 truncate">
            {vehicleSummaryOf(selectedVehicle)}
          </span>
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          clearVehicle();
        }}
        className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0 lg:ml-1"
        aria-label="Изчисти избрания автомобил"
      >
        <X className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
      </button>
    </div>
  );
}
