import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import type { ManufacturerDto, ModelSeriesDto, VehicleVariantDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";
import {
  formatEngineCodes,
  formatPower,
  formatYearRange,
} from "@/lib/catalog/vehicle-specs";
import { ManufacturerGrid } from "./manufacturer-grid";
import { ModelSeriesList } from "./model-series-list";
import { STEP_EMPTY_LABELS, STEP_PLACEHOLDERS, type Step } from "./use-vehicle-selector";

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
  const resultCounts: Record<Step, number> = {
    0: filteredManufacturers.length,
    1: filteredSeries.length,
    2: filteredVariants.length,
  };
  const hasResults = resultCounts[step] > 0;

  const scrollerRef = useRef<HTMLDivElement>(null);

  // One element scrolls all three steps, so it carries its offset across them:
  // picking a make from the foot of the 286-card grid opened the model list
  // already scrolled past its first entries.
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [step]);

  return (
    <div className="flex-1 flex flex-col min-h-0 border-line lg:border-r">
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

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
        {isLoading && <StepSkeleton step={step} />}

        {!isLoading && !hasResults && <NoResults step={step} search={search} />}

        {!isLoading && hasResults && step === 0 && (
          <ManufacturerGrid
            manufacturers={filteredManufacturers}
            isFiltered={search.trim().length > 0}
            onSelect={onSelectMake}
          />
        )}

        {!isLoading && hasResults && step === 1 && (
          <ModelSeriesList series={filteredSeries} onSelect={onSelectSeries} />
        )}

        {!isLoading && hasResults && step === 2 && (
          <VariantList
            variants={filteredVariants}
            pendingVariantId={pendingVariantId}
            onSelect={onSelectVariant}
          />
        )}
      </div>
    </div>
  );
}

function StepSkeleton({ step }: { step: Step }) {
  return (
    <ul
      className={cn(
        step === 0 ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" : "space-y-1",
      )}
      aria-label="Зарежда се..."
      aria-busy="true"
    >
      {Array.from({ length: step === 0 ? 8 : 6 }).map((_, idx) => (
        <li
          key={idx}
          className={cn(
            "rounded-lg bg-bg-sunken animate-pulse",
            step === 0 ? "h-[104px]" : "h-12",
          )}
        />
      ))}
    </ul>
  );
}

/**
 * A step with nothing to list says so, because the panel it fills is the whole
 * dialog: without this, a query matching nothing is a blank white area with a
 * search box above it and no way to tell it apart from a step still loading.
 *
 * It names the query back, since the engine step matches over codes that are
 * not on screen — a visitor who mistypes one otherwise has nothing to check.
 */
function NoResults({ step, search }: { step: Step; search: string }) {
  const query = search.trim();

  return (
    <p role="status" className="px-3 py-10 text-center text-sm text-muted">
      {query ? `Няма резултати за „${query}“` : STEP_EMPTY_LABELS[step]}
    </p>
  );
}

interface VariantListProps {
  variants: VehicleVariantDto[];
  pendingVariantId: string | undefined;
  onSelect: (variant: VehicleVariantDto) => void;
}

function VariantList({ variants, pendingVariantId, onSelect }: VariantListProps) {
  return (
    <ul className="space-y-0.5" role="list" aria-label="Двигатели">
      {variants.map((variant) => {
        const isSelected = pendingVariantId === variant.vehicleId;

        return (
          <li key={variant.vehicleId}>
            <button
              onClick={() => onSelect(variant)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg transition-colors text-left",
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
                  {/* No displacement here: the variant name already carries it ("2.0 TDI"). */}
                  {formatPower(variant.powerKw, variant.powerHp)} · {variant.fuelType} ·{" "}
                  {formatYearRange(variant.yearFrom, variant.yearTo)}
                </div>
              </div>

              {/* Wraps rather than holding its width: a third of variants carry
                  several codes and the search matches over all of them, so a
                  row truncated to the first would hide what it matched on. */}
              <span
                className={cn(
                  "text-xs font-mono max-w-[40%] text-right break-words",
                  isSelected ? "text-white/70" : "text-muted",
                )}
              >
                {formatEngineCodes(variant.engineCodes)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
