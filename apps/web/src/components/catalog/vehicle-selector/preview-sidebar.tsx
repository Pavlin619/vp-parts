import { useState, type ReactNode } from "react";
import Image from "next/image";
import type { VehicleVariantDto } from "@vp-parts-shop/shared";
import {
  formatDisplacement,
  formatEngineCodes,
  formatPower,
  formatYearRange,
} from "@/lib/catalog/vehicle-specs";
import {
  SERIES_PHOTO_HEIGHT,
  SERIES_PHOTO_WIDTH,
} from "@/lib/catalog/vehicle-series-photo";
import { cn } from "@/lib/utils";
import { MakeMark } from "./make-mark";
import type { SelectedMake, SelectedSeries } from "./use-vehicle-selector";

/** The width the frame renders at, for the badge's source-set hint. */
const FRAME_SIZES = "248px";

/** An answer the visitor has not reached yet, rather than one we do not have. */
const UNKNOWN_VALUE = "—";

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
  // Remembering *which* URL failed rather than a boolean is what lets the next
  // model try again: the flag clears itself when the URL changes, with no
  // effect to keep in sync.
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const photoUrl = seriesPhotoUrl === failedPhotoUrl ? null : seriesPhotoUrl;

  return (
    // Dropped below `lg`, where its 288px would leave the list it previews
    // about 70px to render in. What it says is on screen anyway by then: the
    // step tabs carry the make and model, and the footer confirms the variant.
    <div className="hidden w-72 flex-shrink-0 flex-col bg-canvas p-5 gap-4 overflow-y-auto lg:flex">
      <PreviewFrame
        selectedMake={selectedMake}
        selectedSeries={selectedSeries}
        photoUrl={photoUrl}
        onPhotoError={() => setFailedPhotoUrl(photoUrl)}
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

        <dl className="border-t border-line text-sm">
          {previewSpecs(pendingVariant).map((spec) => (
            <SpecRow key={spec.label} {...spec} />
          ))}
        </dl>

        <p className="text-[10px] text-muted leading-relaxed">
          ⓘ Данните се предоставят от TecDoc. Винаги сверявай OEM номер.
        </p>
      </div>
    </div>
  );
}

interface PreviewSpec {
  label: string;
  value: string | null;
  /** A code to be read character by character rather than a phrase. */
  isCode?: boolean;
}

/**
 * The sheet the sidebar prints, whether or not there is anything to fill it
 * with.
 *
 * The first four rows are what identifies a car, so they are on screen from the
 * first paint with a dash where the answer is not known yet — a sheet that
 * appeared row by row would read as the panel loading rather than as the visitor
 * having steps left. Displacement and fuel describe the engine instead, and the
 * engine list prints both against every row of it, so they are only worth
 * repeating once one is picked.
 */
function previewSpecs(variant: VehicleVariantDto | null): PreviewSpec[] {
  const displacement = variant ? formatDisplacement(variant.displacementLiters) : null;

  return [
    {
      label: "Година",
      value: variant ? formatYearRange(variant.yearFrom, variant.yearTo) : null,
    },
    // A third of vehicles are built with more than one engine, and the visitor
    // is matching this against the code on the block in front of them — so all
    // of them print, for the same reason the type-approval numbers below do.
    {
      label: "Двигател",
      value: formatEngineCodes(variant?.engineCodes),
      isCode: true,
    },
    {
      label: "Мощност",
      value: variant ? formatPower(variant.powerKw, variant.powerHp) : null,
    },
    // Empty for 4% of variants, and joined rather than truncated: a variant sold
    // under two type approvals carries both, and the visitor is matching this
    // against a registration document that names one of them.
    //
    // Chained through a required field on purpose: the API caches variants for a
    // day, so a deploy that reaches the web first is answered from entries filed
    // before the field existed. Absent has to read as unknown rather than blank
    // the dialog out.
    { label: "KBA код", value: variant?.kbaNumbers?.join(", ") || null, isCode: true },
    ...(displacement ? [{ label: "Обем", value: displacement }] : []),
    ...(variant ? [{ label: "Гориво", value: variant.fuelType }] : []),
  ];
}

function SpecRow({ label, value, isCode }: PreviewSpec) {
  return (
    <div className="flex justify-between gap-2 border-b border-line py-2.5">
      <dt className="text-muted flex-shrink-0">{label}</dt>
      <dd className={cn("font-medium text-ink text-right", isCode && "font-mono")}>
        {value ?? UNKNOWN_VALUE}
      </dd>
    </div>
  );
}

/**
 * The most specific picture available: the series photo, else the make's badge,
 * else a hatched panel.
 *
 * A photo whose signed token has died falls back to the badge rather than to the
 * panel — the make is still known, so there is still something true to show.
 */
function PreviewFrame({
  selectedMake,
  selectedSeries,
  photoUrl,
  onPhotoError,
}: {
  selectedMake: SelectedMake | null;
  selectedSeries: SelectedSeries | null;
  photoUrl: string | null;
  onPhotoError: () => void;
}) {
  if (photoUrl) {
    const photoLabel = [selectedMake?.name, selectedSeries?.name]
      .filter(Boolean)
      .join(" ");

    return (
      // The asset's background is baked white, so the frame behind it has to be
      // white too — on the sunken surface it drew as a white box inside a beige
      // one. It is 800x287 against a taller frame, which leaves it centred with
      // white above and below rather than filling the box; the frame has to fit
      // a badge as well, and a badge is nowhere near that wide.
      <Frame className="bg-white">
        <Image
          src={photoUrl}
          alt={photoLabel}
          width={SERIES_PHOTO_WIDTH}
          height={SERIES_PHOTO_HEIGHT}
          // TecDoc already serves this pre-sized and compressed, so the
          // optimizer would only re-encode it — and it could not cache the
          // result anyway, since the URL carries a token minted per response.
          unoptimized
          // The URL is a signed token cached for hours, so it can be dead by
          // the time a browser asks for it. That has to cost the badge rather
          // than the browser's broken-image icon.
          onError={onPhotoError}
          className="w-full h-auto"
        />
      </Frame>
    );
  }

  if (selectedMake) {
    // White for the same reason the grid cards are: these are photographic
    // marks drawn for white, 28 of them opaque rather than transparent.
    return (
      <Frame className="bg-white">
        <MakeMark make={selectedMake} sizes={FRAME_SIZES} logoInset="p-6" />
      </Frame>
    );
  }

  return (
    <Frame className="hatched bg-bg-sunken">
      <span className="text-[10px] font-semibold text-muted uppercase tracking-widest">
        Лого · фото на модел
      </span>
    </Frame>
  );
}

/**
 * One ratio for all three states, so the panel does not resize under the visitor
 * when a make is picked or a photo arrives.
 */
function Frame({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "aspect-[16/9] rounded-xl border border-line flex items-center",
        "justify-center flex-shrink-0 overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
