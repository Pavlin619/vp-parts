"use client";

import { X, Car } from "lucide-react";
import { useVehicleContext, useHydration } from "@/hooks/use-vehicle-context";

interface VehiclePillProps {
  onOpenSelector: () => void;
}

export function VehiclePill({ onOpenSelector }: VehiclePillProps) {
  const isHydrated = useHydration();
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
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent">
          <Car className="w-4 h-4 text-white" aria-hidden="true" />
        </span>
        <span className="hidden flex-col items-start leading-none lg:flex">
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            {selectedVehicle.manufacturerName} · {selectedVehicle.seriesName}
          </span>
          <span className="text-[11px] text-white/60 mt-0.5">
            {selectedVehicle.engine} · {selectedVehicle.powerKw} kW ·{" "}
            {selectedVehicle.yearFrom}
            {selectedVehicle.yearTo ? `–${selectedVehicle.yearTo}` : "+"}
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
