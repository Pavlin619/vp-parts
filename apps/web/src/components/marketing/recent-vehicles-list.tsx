"use client";

import { Info } from "lucide-react";
import { useVehicleContext } from "@/hooks/use-vehicle-context";
import { useIsHydrated } from "@/hooks/use-is-hydrated";

export function RecentVehiclesList() {
  const isHydrated = useIsHydrated();
  const recentVehicles = useVehicleContext((state) => state.recentVehicles);
  const setVehicle = useVehicleContext((state) => state.setVehicle);

  const recents = isHydrated ? recentVehicles.slice(0, 3) : [];

  if (recents.length === 0) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-muted flex-shrink-0">
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
        Последни:
      </div>
      <div className="flex gap-2 flex-wrap">
        {recents.map((vehicle) => (
          <button
            key={vehicle.vehicleId}
            onClick={() => setVehicle(vehicle)}
            className="px-3 py-1.5 border border-line rounded-full text-xs font-medium text-ink hover:bg-bg-sunken transition-colors"
          >
            {vehicle.manufacturerName} {vehicle.seriesName}
          </button>
        ))}
      </div>
    </div>
  );
}
