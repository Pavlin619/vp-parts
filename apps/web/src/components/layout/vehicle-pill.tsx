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
        className="h-10 w-40 rounded-lg bg-ink/20 animate-pulse"
        aria-hidden="true"
      />
    );
  }

  if (!selectedVehicle) {
    return (
      <button
        onClick={onOpenSelector}
        className="flex items-center gap-2 h-10 px-4 bg-ink text-white rounded-lg text-sm font-medium hover:bg-ink/90 transition-colors"
        aria-label="Избери автомобил"
      >
        <Car className="w-4 h-4" aria-hidden="true" />
        Избери автомобил
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-ink rounded-xl">
      <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
        <Car className="w-4 h-4 text-white" aria-hidden="true" />
      </div>
      <button
        onClick={onOpenSelector}
        className="flex flex-col items-start leading-none text-left"
        aria-label="Промени избрания автомобил"
      >
        <span className="text-xs font-bold text-white uppercase tracking-wide">
          {selectedVehicle.manufacturerName} · {selectedVehicle.seriesName}
        </span>
        <span className="text-[11px] text-white/60 mt-0.5">
          {selectedVehicle.engine} · {selectedVehicle.powerKw} kW ·{" "}
          {selectedVehicle.yearFrom}
          {selectedVehicle.yearTo ? `–${selectedVehicle.yearTo}` : "+"}
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          clearVehicle();
        }}
        className="ml-1 p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
        aria-label="Изчисти избрания автомобил"
      >
        <X className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
      </button>
    </div>
  );
}
