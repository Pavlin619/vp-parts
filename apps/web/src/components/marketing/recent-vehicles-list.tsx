"use client";

import { Info } from "lucide-react";
import { useVehicleContext, useHydration } from "@/hooks/use-vehicle-context";
import { cn } from "@/lib/utils";

type Mode = "manual" | "vin" | "plate";

interface RecentVehiclesListProps {
  mode: Mode;
}

export function RecentVehiclesList({ mode }: RecentVehiclesListProps) {
  const isHydrated = useHydration();
  const recentVehicles = useVehicleContext((state) => state.recentVehicles);
  const setVehicle = useVehicleContext((state) => state.setVehicle);

  const recents = isHydrated ? recentVehicles.slice(0, 3) : [];

  if (recents.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 flex-wrap",
        mode === "manual" ? "mb-5" : "my-5",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted flex-shrink-0">
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
        Последни:
      </div>
      <div className="flex gap-2 flex-wrap">
        {recents.map((v) => (
          <button
            key={v.vehicleId}
            onClick={() => setVehicle(v)}
            className="px-3 py-1.5 border border-line rounded-full text-xs font-medium text-ink hover:bg-bg-sunken transition-colors"
          >
            {v.manufacturerName} {v.seriesName}
          </button>
        ))}
      </div>
    </div>
  );
}
