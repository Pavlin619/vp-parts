import { Car } from "lucide-react";
import type { ManufacturerDto, ModelSeriesDto, VehicleVariantDto } from "@vp-parts-shop/shared";

interface VehiclePreviewSidebarProps {
  selectedMake: ManufacturerDto | null;
  selectedSeries: ModelSeriesDto | null;
  pendingVariant: VehicleVariantDto | null;
}

export function VehiclePreviewSidebar({
  selectedMake,
  selectedSeries,
  pendingVariant,
}: VehiclePreviewSidebarProps) {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col p-5 gap-4 overflow-y-auto">
      <div className="h-36 rounded-xl bg-bg-sunken border border-line flex items-center justify-center flex-shrink-0">
        {selectedMake ? (
          <div className="text-center px-4">
            <Car className="w-8 h-8 text-muted mx-auto mb-2" aria-hidden="true" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">
              {selectedMake.name}
              {selectedSeries && ` · ${selectedSeries.name}`}
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-semibold text-muted uppercase tracking-widest">
            Марка · Модел · Снимка
          </span>
        )}
      </div>

      {selectedMake ? (
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Избран автомобил
          </p>
          <div>
            <p className="font-display font-bold text-2xl text-ink leading-tight">
              {selectedMake.name}
            </p>
            {selectedSeries && (
              <p className="text-sm text-ink-2 mt-0.5">{selectedSeries.name}</p>
            )}
          </div>

          {pendingVariant && (
            <dl className="space-y-2 text-sm pt-1 border-t border-line">
              <div className="flex justify-between gap-2">
                <dt className="text-muted flex-shrink-0">Година</dt>
                <dd className="font-medium text-ink text-right">
                  {pendingVariant.yearFrom}–{pendingVariant.yearTo ?? ""}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted flex-shrink-0">Двигател</dt>
                <dd className="font-medium text-ink font-mono text-right">
                  {pendingVariant.engine}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted flex-shrink-0">Мощност</dt>
                <dd className="font-medium text-ink text-right">{pendingVariant.powerKw} kW</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted flex-shrink-0">Гориво</dt>
                <dd className="font-medium text-ink text-right">{pendingVariant.fuelType}</dd>
              </div>
            </dl>
          )}

          {pendingVariant && (
            <p className="text-[10px] text-muted leading-relaxed">
              ⓘ Данните се предоставят от TecDoc. Винаги сверявай OEM номер.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted text-center leading-relaxed">
          Изберете марка, модел и двигател, за да видите съвместимите части.
        </p>
      )}
    </div>
  );
}
