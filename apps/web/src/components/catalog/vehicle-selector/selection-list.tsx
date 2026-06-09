import { Search } from "lucide-react";
import type { ManufacturerDto, ModelSeriesDto, VehicleVariantDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";
import { STEP_PLACEHOLDERS, type Step } from "./use-vehicle-selector";

interface VehicleSelectionListProps {
  step: Step;
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  filteredManufacturers: ManufacturerDto[];
  filteredSeries: ModelSeriesDto[];
  filteredVariants: VehicleVariantDto[];
  pendingVariantId: string | undefined;
  onSelectMake: (make: ManufacturerDto) => void;
  onSelectSeries: (series: ModelSeriesDto) => void;
  onSelectVariant: (variant: VehicleVariantDto) => void;
}

export function VehicleSelectionList({
  step,
  search,
  onSearchChange,
  isLoading,
  filteredManufacturers,
  filteredSeries,
  filteredVariants,
  pendingVariantId,
  onSelectMake,
  onSelectSeries,
  onSelectVariant,
}: VehicleSelectionListProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 border-r border-line">
      <div className="px-5 py-3 flex-shrink-0">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder={STEP_PLACEHOLDERS[step]}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-10 pl-9 pr-3 bg-bg-card border border-line rounded-lg text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(11,18,32,0.06)]"
            aria-label={STEP_PLACEHOLDERS[step]}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
        {isLoading && (
          <ul className="space-y-1" aria-label="Зарежда се..." aria-busy="true">
            {Array.from({ length: 6 }).map((_, idx) => (
              <li key={idx} className="h-12 rounded-lg bg-bg-sunken animate-pulse" />
            ))}
          </ul>
        )}

        {!isLoading && step === 0 && (
          <ul className="space-y-0.5" role="list" aria-label="Марки">
            {filteredManufacturers.map((make) => (
              <li key={make.id}>
                <button
                  onClick={() => onSelectMake(make)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-bg-sunken transition-colors text-left"
                >
                  <span className="font-medium text-sm text-ink">{make.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!isLoading && step === 1 && (
          <ul className="space-y-0.5" role="list" aria-label="Модели">
            {filteredSeries.map((series) => (
              <li key={series.id}>
                <button
                  onClick={() => onSelectSeries(series)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-bg-sunken transition-colors text-left"
                >
                  <span className="font-medium text-sm text-ink">{series.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!isLoading && step === 2 && (
          <ul className="space-y-0.5" role="list" aria-label="Двигатели">
            {filteredVariants.map((variant) => {
              const isSelected = pendingVariantId === variant.vehicleId;
              return (
                <li key={variant.vehicleId}>
                  <button
                    onClick={() => onSelectVariant(variant)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-3 rounded-lg transition-colors text-left",
                      isSelected ? "bg-ink" : "hover:bg-bg-sunken",
                    )}
                  >
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "font-semibold text-sm",
                          isSelected ? "text-white" : "text-ink",
                        )}
                      >
                        {variant.name}
                      </div>
                      <div
                        className={cn(
                          "text-xs mt-0.5",
                          isSelected ? "text-white/60" : "text-muted",
                        )}
                      >
                        {variant.powerKw} kW · {variant.fuelType} · {variant.yearFrom}
                        {variant.yearTo ? `–${variant.yearTo}` : "+"}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-mono ml-3 flex-shrink-0",
                        isSelected ? "text-white/70" : "text-muted",
                      )}
                    >
                      {variant.engine}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
