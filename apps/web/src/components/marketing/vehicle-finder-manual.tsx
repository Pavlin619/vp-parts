"use client";

import { Check, ChevronDown } from "lucide-react";
import { useVehicleContext, useHydration } from "@/hooks/use-vehicle-context";
import { cn } from "@/lib/utils";
import { VehicleFinderSearchInput } from "./vehicle-finder-search-input";

interface VehicleFinderManualProps {
  onOpenSelector: () => void;
}

export function VehicleFinderManual({ onOpenSelector }: VehicleFinderManualProps) {
  const isHydrated = useHydration();
  const selectedVehicle = useVehicleContext((state) => state.selectedVehicle);
  const vehicle = isHydrated ? selectedVehicle : null;

  return (
    <>
      <div className="space-y-3">
        <div>
          <div
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5",
              vehicle ? "text-ok" : "text-muted",
            )}
          >
            {vehicle && <Check className="w-3 h-3" aria-hidden="true" />}
            Марка
          </div>
          <button
            onClick={onOpenSelector}
            className="w-full flex items-center justify-between h-12 px-4 bg-bg-card border border-line rounded-lg hover:border-ink-3 transition-colors text-left"
          >
            <span className={cn("text-sm font-medium", vehicle ? "text-ink" : "text-muted")}>
              {vehicle ? vehicle.manufacturerName : "Избери марка"}
            </span>
            <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5",
                vehicle ? "text-ok" : "text-muted",
              )}
            >
              {vehicle && <Check className="w-3 h-3" aria-hidden="true" />}
              Модел
            </div>
            <button
              onClick={onOpenSelector}
              className="w-full flex items-center justify-between h-12 px-4 bg-bg-card border border-line rounded-lg hover:border-ink-3 transition-colors text-left"
            >
              <span
                className={cn("text-sm font-medium truncate", vehicle ? "text-ink" : "text-muted")}
              >
                {vehicle ? vehicle.seriesName : "Модел"}
              </span>
              <ChevronDown
                className="w-4 h-4 text-muted flex-shrink-0 ml-2"
                aria-hidden="true"
              />
            </button>
          </div>

          <div>
            <div
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5",
                vehicle ? "text-ok" : "text-muted",
              )}
            >
              {vehicle && <Check className="w-3 h-3" aria-hidden="true" />}
              Двигател
            </div>
            <button
              onClick={onOpenSelector}
              className="w-full flex items-center justify-between h-12 px-4 bg-bg-card border border-line rounded-lg hover:border-ink-3 transition-colors text-left"
            >
              <span
                className={cn("text-sm font-medium truncate", vehicle ? "text-ink" : "text-muted")}
              >
                {vehicle ? vehicle.variantName : "Двигател"}
              </span>
              <ChevronDown
                className="w-4 h-4 text-muted flex-shrink-0 ml-2"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>

      <div className="my-5">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-line" />
          <span className="text-xs text-muted">или</span>
          <div className="flex-1 h-px bg-line" />
        </div>
        <div className="mt-4">
          <VehicleFinderSearchInput placeholder="ВЪВЕДИ VIN (17 СИМВОЛА)" showCamera />
        </div>
      </div>
    </>
  );
}
