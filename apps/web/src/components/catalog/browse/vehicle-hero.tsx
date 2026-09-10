"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Pencil, X } from "lucide-react";
import { VehicleMakeBadge } from "@/components/catalog/vehicle-make-badge";
import { useSeriesPhoto } from "@/hooks/use-series-photo";
import { useSelectedVariant } from "@/hooks/use-selected-variant";
import type { SelectedVehicle } from "@/hooks/use-vehicle-context";
import {
  SERIES_PHOTO_HEIGHT,
  SERIES_PHOTO_WIDTH,
} from "@/lib/catalog/vehicle-series-photo";
import {
  formatDisplacement,
  formatEngineCodes,
  formatPower,
  formatYearRange,
} from "@/lib/catalog/vehicle-specs";
import { cn } from "@/lib/utils";

interface HeroSpec {
  label: string;
  value: string | null;
  isCode?: boolean;
}

interface VehicleHeroProps {
  vehicle: SelectedVehicle;
  onEdit: () => void;
  onClear: () => void;
}

/**
 * The car the catalog below is answering for, stated once at full size.
 *
 * Only the specs with an answer are printed — a spec sheet with dashes in it
 * reads as data we failed to load, when in fact TecDoc files no KBA number for
 * 4% of variants and no engine code for a third.
 */
export function VehicleHero({ vehicle, onEdit, onClear }: VehicleHeroProps) {
  const variant = useSelectedVariant(vehicle);
  const seriesPhotoUrl = useSeriesPhoto(vehicle.seriesId);

  const specs = heroSpecs(vehicle, variant?.bodyType, variant?.kbaNumbers);
  const engineLine = [
    vehicle.variantName,
    variant ? formatDisplacement(variant.displacementLiters) : null,
    formatPower(vehicle.powerKw, vehicle.powerHp),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className={cn(
        "relative mb-6 grid items-start gap-x-7 gap-y-[18px] overflow-hidden rounded-xl",
        "border border-line bg-bg-card p-[18px]",
        "lg:grid-cols-[minmax(240px,340px)_minmax(0,1fr)_auto]",
        "lg:[grid-template-areas:'photo_head_actions'_'photo_specs_specs']",
      )}
    >
      {/* The brand glow sits behind the photo only, so the spec strip keeps a
          plain surface to be read against. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[min(40%,460px)] opacity-65 [background:radial-gradient(ellipse_at_22%_55%,var(--brand-soft),transparent_72%)]"
      />

      <VehiclePhoto
        vehicle={vehicle}
        seriesPhotoUrl={seriesPhotoUrl}
        className="relative z-10 self-stretch lg:[grid-area:photo]"
      />

      <div className="relative z-10 min-w-0 pt-1 lg:[grid-area:head]">
        <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase leading-tight tracking-[0.06em] text-ok">
          <Check className="h-3 w-3" aria-hidden="true" />
          Данни от TecDoc
        </p>
        <h2 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em]">
          {vehicle.manufacturerName}{" "}
          <span className="font-medium text-ink-3">{vehicle.seriesName}</span>
        </h2>
        <p className="mt-1.5 text-sm text-ink-2">{engineLine}</p>
      </div>

      <div className="relative z-10 flex items-center gap-1.5 pt-1 lg:[grid-area:actions]">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-bg-card px-3 text-[13px] font-medium text-ink transition-colors hover:border-ink-3"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Промени
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-canvas hover:text-danger"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Премахни
        </button>
      </div>

      <dl className="relative z-10 grid grid-cols-2 self-end border-t border-line pt-3.5 sm:grid-cols-3 lg:[grid-area:specs] lg:grid-cols-[repeat(var(--spec-count),minmax(0,1fr))]"
        style={{ ["--spec-count" as string]: specs.length }}
      >
        {specs.map((spec, index) => (
          <div
            key={spec.label}
            className={cn(
              "px-[18px] py-1",
              index === 0 && "lg:pl-0",
              index > 0 && "lg:border-l lg:border-line",
            )}
          >
            <dt className="mb-[3px] text-[11px] uppercase tracking-[0.06em] text-ink-4">
              {spec.label}
            </dt>
            <dd
              className={cn(
                "truncate text-sm font-medium tabular-nums text-ink",
                spec.isCode && "font-mono",
              )}
            >
              {spec.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function heroSpecs(
  vehicle: SelectedVehicle,
  bodyType: string | undefined,
  kbaNumbers: string[] | undefined,
): Required<HeroSpec>[] {
  const specs: HeroSpec[] = [
    { label: "Двигател", value: formatEngineCodes(vehicle.engineCodes), isCode: true },
    { label: "Мощност", value: formatPower(vehicle.powerKw, vehicle.powerHp) },
    { label: "Години", value: formatYearRange(vehicle.yearFrom, vehicle.yearTo) },
    { label: "Каросерия", value: bodyType ?? null },
    { label: "KBA код", value: kbaNumbers?.join(", ") || null, isCode: true },
  ];

  return specs
    .filter((spec): spec is HeroSpec & { value: string } => spec.value !== null)
    .map((spec) => ({ ...spec, isCode: spec.isCode ?? false }));
}

function VehiclePhoto({
  vehicle,
  seriesPhotoUrl,
  className,
}: {
  vehicle: SelectedVehicle;
  seriesPhotoUrl: string | null;
  className?: string;
}) {
  // Remembering which URL failed rather than a boolean is what lets the next car
  // try again: the flag clears itself when the URL changes.
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const photoUrl = seriesPhotoUrl === failedPhotoUrl ? null : seriesPhotoUrl;

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-full min-h-[186px] items-center justify-center overflow-hidden rounded-lg border border-line",
          photoUrl ? "bg-white" : "hatched bg-bg-sunken",
        )}
      >
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={`${vehicle.manufacturerName} ${vehicle.seriesName}`}
            width={SERIES_PHOTO_WIDTH}
            height={SERIES_PHOTO_HEIGHT}
            // TecDoc serves this pre-sized, and the URL carries a token minted
            // per response, so the optimizer could not cache a transform anyway.
            unoptimized
            onError={() => setFailedPhotoUrl(photoUrl)}
            className="h-auto w-full"
          />
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Фото на модел
          </span>
        )}
      </div>

      <VehicleMakeBadge
        manufacturerId={vehicle.manufacturerId}
        className="absolute bottom-2.5 left-2.5 h-[30px] w-11 rounded-sm border border-line"
      />
    </div>
  );
}
