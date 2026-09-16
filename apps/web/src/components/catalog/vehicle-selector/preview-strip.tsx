import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { VehicleVariantDto } from "@vp-parts-shop/shared";
import { formatPower } from "@/lib/catalog/display/vehicle-specs";
import { cn } from "@/lib/utils";
import { PreviewFrame } from "./preview-frame";
import { UNKNOWN_VALUE, VehicleSpecGrid } from "./preview-specs";
import type { SelectedMake, SelectedSeries } from "./use-vehicle-selector";

interface VehiclePreviewStripProps {
  selectedMake: SelectedMake | null;
  selectedSeries: SelectedSeries | null;
  pendingVariant: VehicleVariantDto | null;
  seriesPhotoUrl: string | null;
}

/**
 * What the sidebar says, on a screen too narrow to stand a column beside the
 * list: the car so far as one row above it, with the specification sheet folded
 * away behind the row itself.
 *
 * Held back until a make is picked — the sidebar spends the brand step on a
 * hatched panel and a prompt, which is worth a column that is there anyway and
 * not worth taking the height off a grid of 286 makes.
 */
export function VehiclePreviewStrip({
  selectedMake,
  selectedSeries,
  pendingVariant,
  seriesPhotoUrl,
}: VehiclePreviewStripProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!selectedMake) return null;

  const summary = (
    <PreviewSummary
      selectedMake={selectedMake}
      selectedSeries={selectedSeries}
      pendingVariant={pendingVariant}
      seriesPhotoUrl={seriesPhotoUrl}
    />
  );

  return (
    <div className="flex flex-shrink-0 flex-col border-b border-line bg-canvas lg:hidden">
      {/* Every row of the sheet describes an engine, so until one is picked
          there is nothing behind the disclosure to open. */}
      {pendingVariant ? (
        <button
          type="button"
          onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
          aria-expanded={isExpanded}
          aria-label="Детайли за автомобила"
          className="flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-sunken sm:px-6"
        >
          {summary}
          <ChevronDown
            className={cn(
              "h-4 w-4 flex-shrink-0 text-muted transition-transform",
              isExpanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">{summary}</div>
      )}

      {isExpanded && pendingVariant && (
        <div className="px-4 pb-3 sm:px-6">
          <VehicleSpecGrid variant={pendingVariant} />
        </div>
      )}
    </div>
  );
}

interface PreviewSummaryProps extends Omit<VehiclePreviewStripProps, "selectedMake"> {
  selectedMake: SelectedMake;
}

/**
 * The car in one line each: the picture, the make, the model, and the engine
 * once there is one. The engine list is long enough to scroll the picked row
 * off screen, which is what the third line is for.
 */
function PreviewSummary({
  selectedMake,
  selectedSeries,
  pendingVariant,
  seriesPhotoUrl,
}: PreviewSummaryProps) {
  return (
    <>
      <PreviewFrame
        selectedMake={selectedMake}
        selectedSeries={selectedSeries}
        seriesPhotoUrl={seriesPhotoUrl}
        size="compact"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-bold leading-tight text-ink">
          {selectedMake.name}
        </p>
        <p className="truncate text-xs text-ink-2">{selectedSeries?.name ?? UNKNOWN_VALUE}</p>
        {pendingVariant && (
          <p className="truncate text-xs text-muted">
            {/* No fuel or years: the row is a phone wide and the sheet below
                carries both. */}
            {pendingVariant.name} · {formatPower(pendingVariant.powerKw, pendingVariant.powerHp)}
          </p>
        )}
      </div>
    </>
  );
}
