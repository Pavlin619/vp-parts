import { useState } from "react";
import Image from "next/image";
import { Car } from "lucide-react";
import type { ManufacturerDto, ModelSeriesDto, VehicleVariantDto } from "@vp-parts-shop/shared";
import { formatDisplacement, formatPower } from "@/lib/catalog/vehicle-specs";
import { cn } from "@/lib/utils";

// The 800px asset TecDoc serves, measured identical on every series sampled.
// The frame below carries the same ratio, so the photo fills it edge to edge
// and the placeholder reserves the exact space the photo will occupy.
const PHOTO_WIDTH = 800;
const PHOTO_HEIGHT = 287;

interface VehiclePreviewSidebarProps {
  selectedMake: ManufacturerDto | null;
  selectedSeries: ModelSeriesDto | null;
  pendingVariant: VehicleVariantDto | null;
  seriesPhotoUrl: string | null;
}

export function VehiclePreviewSidebar({
  selectedMake,
  selectedSeries,
  pendingVariant,
  seriesPhotoUrl,
}: VehiclePreviewSidebarProps) {
  // Remembering *which* URL failed rather than a boolean is what lets the next
  // model try again: the flag clears itself when the URL changes, with no
  // effect to keep in sync.
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const photoUrl = seriesPhotoUrl === failedPhotoUrl ? null : seriesPhotoUrl;

  const displacement = pendingVariant
    ? formatDisplacement(pendingVariant.displacementLiters)
    : null;

  const photoLabel = [selectedMake?.name, selectedSeries?.name].filter(Boolean).join(" ");

  return (
    // Dropped below `lg`, where its 288px would leave the list it previews
    // about 70px to render in. What it says is on screen anyway by then: the
    // step tabs carry the make and model, and the footer confirms the variant.
    <div className="hidden w-72 flex-shrink-0 flex-col p-5 gap-4 overflow-y-auto lg:flex">
      <div
        className={cn(
          "aspect-[800/287] rounded-xl border border-line flex items-center",
          "justify-center flex-shrink-0 overflow-hidden",
          // The asset's background is baked white, so the frame behind it has to
          // be white too. `bg-bg-sunken` is the more consistent-looking choice
          // and it drew the photo as a white box inside a beige one.
          photoUrl ? "bg-white" : "bg-bg-sunken",
        )}
      >
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={photoLabel}
            width={PHOTO_WIDTH}
            height={PHOTO_HEIGHT}
            // TecDoc already serves this pre-sized and compressed, so the
            // optimizer would only re-encode it — and it could not cache the
            // result anyway, since the URL carries a token minted per response.
            unoptimized
            // The URL is a signed token cached for hours, so it can be dead by
            // the time a browser asks for it. That has to cost the placeholder
            // rather than the browser's broken-image icon.
            onError={() => setFailedPhotoUrl(photoUrl)}
            className="w-full h-auto"
          />
        ) : selectedMake ? (
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
                <dd className="font-medium text-ink text-right">
                  {formatPower(pendingVariant.powerKw, pendingVariant.powerHp)}
                </dd>
              </div>
              {displacement && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted flex-shrink-0">Обем</dt>
                  <dd className="font-medium text-ink text-right">{displacement}</dd>
                </div>
              )}
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
