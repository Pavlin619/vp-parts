import type { VehicleVariantDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";
import { PreviewFrame } from "./preview-frame";
import { UNKNOWN_VALUE, VehicleSpecSheet } from "./preview-specs";
import type { SelectedMake, SelectedSeries } from "./use-vehicle-selector";

interface VehiclePreviewSidebarProps {
  selectedMake: SelectedMake | null;
  selectedSeries: SelectedSeries | null;
  pendingVariant: VehicleVariantDto | null;
  seriesPhotoUrl: string | null;
}

export function VehiclePreviewSidebar({
  selectedMake,
  selectedSeries,
  pendingVariant,
  seriesPhotoUrl,
}: VehiclePreviewSidebarProps) {
  return (
    // Dropped below `lg`, where its 288px would leave the list it previews
    // about 70px to render in. `VehiclePreviewStrip` carries the same answers
    // across the top of the list there.
    <div className="hidden w-72 flex-shrink-0 flex-col bg-canvas p-5 gap-4 overflow-y-auto lg:flex">
      <PreviewFrame
        selectedMake={selectedMake}
        selectedSeries={selectedSeries}
        seriesPhotoUrl={seriesPhotoUrl}
        size="full"
      />

      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
          Избран автомобил
        </p>

        <div>
          <p
            className={cn(
              "font-display font-bold text-2xl leading-tight",
              selectedMake ? "text-ink" : "text-ink-4",
            )}
          >
            {selectedMake?.name ?? "Избери марка…"}
          </p>
          {selectedMake && (
            <p className="text-sm text-ink-2 mt-0.5">
              {selectedSeries?.name ?? UNKNOWN_VALUE}
            </p>
          )}
        </div>

        <VehicleSpecSheet variant={pendingVariant} />

        <p className="text-[10px] text-muted leading-relaxed">
          ⓘ Данните се предоставят от TecDoc. Винаги сверявай OEM номер.
        </p>
      </div>
    </div>
  );
}
