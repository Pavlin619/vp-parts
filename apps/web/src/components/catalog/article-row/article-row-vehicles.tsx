"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type {
  LinkedVehicleDto,
  LinkedVehicleManufacturerDto,
  LinkedVehicleSeriesDto,
} from "@vp-parts-shop/shared";
import {
  linkedManufacturersQueryOptions,
  linkedVehiclesByMakeQueryOptions,
} from "@/lib/api/catalog";
import { cn } from "@/lib/utils";
import { SectionLoadError } from "./section-load-error";

interface ArticleRowVehiclesProps {
  /**
   * The article's TecDoc brand. Required alongside the number because linkages
   * are per part and a number can belong to more than one — without it the
   * section can show another company's vehicles.
   */
  brandId: string;
  articleNumber: string;
}

/**
 * The applicable-vehicles section of a catalog row: makes, then the model
 * series and modifications of whichever make a visitor opens.
 *
 * A common service part fits thousands of modifications, so the section opens
 * with makes alone and hydrates one make at a time. Opening a make brings back
 * its whole tree, which is why expanding a series below it costs nothing —
 * every make nonetheless starts collapsed, since a make is the one level that
 * still has to be fetched.
 */
export function ArticleRowVehicles({
  brandId,
  articleNumber,
}: ArticleRowVehiclesProps) {
  const { data, isPending, isError, refetch } = useQuery(
    linkedManufacturersQueryOptions(brandId, articleNumber),
  );

  if (isPending) {
    return <VehiclesSkeleton testId="article-row-vehicles-skeleton" />;
  }

  if (isError) {
    return (
      <SectionLoadError
        message="В момента не можем да заредим приложимите автомобили."
        onRetry={() => refetch()}
      />
    );
  }

  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-2 bg-canvas p-5 text-[13px] text-ink-3">
        Няма данни за приложими автомобили за този артикул.
      </p>
    );
  }

  return (
    <div className="max-w-[780px]">
      {data.map((manufacturer) => (
        <MakeDisclosure
          key={manufacturer.manufacturerId}
          brandId={brandId}
          articleNumber={articleNumber}
          manufacturer={manufacturer}
        />
      ))}
    </div>
  );
}

function MakeDisclosure({
  brandId,
  articleNumber,
  manufacturer,
}: {
  brandId: string;
  articleNumber: string;
  manufacturer: LinkedVehicleManufacturerDto;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    ...linkedVehiclesByMakeQueryOptions(
      brandId,
      articleNumber,
      manufacturer.manufacturerId,
    ),
    enabled: isOpen,
  });

  return (
    <div className="mb-1.5 overflow-hidden rounded-md border border-line bg-canvas last:mb-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center gap-[9px] px-[13px] py-[11px] text-left transition-colors hover:bg-bg-card focus-visible:outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-accent",
          isOpen && "border-b border-line bg-bg-card",
        )}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-ink-3 transition-transform",
            isOpen && "rotate-90",
          )}
          aria-hidden="true"
        />
        <span className="font-display text-[13px] font-bold tracking-[0.02em] text-ink">
          {manufacturer.name}
        </span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-1.5 p-2">
          {isPending && <VehiclesSkeleton testId="linked-vehicles-skeleton" />}

          {isError && (
            <SectionLoadError
              message="В момента не можем да заредим моделите."
              onRetry={() => refetch()}
            />
          )}

          {/* The make came from the linkage read, so it having no vehicles
              behind it is a contradiction — but it renders as an empty box, and
              a visitor who opened it deserves an answer rather than blank
              space. */}
          {data?.length === 0 && (
            <p className="px-[11px] py-[9px] text-[12.5px] text-ink-3">
              Няма данни за моделите на тази марка.
            </p>
          )}

          {data?.map((series) => (
            <SeriesDisclosure
              key={series.seriesId}
              series={series}
              isOnlySeries={data.length === 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One model series and the modifications under it. Presentational: its vehicles
 * came down with the make, so opening it is local state and never a spinner.
 *
 * A make with a single series opens it straight away — collapsing the only
 * choice on offer just costs a click.
 */
function SeriesDisclosure({
  series,
  isOnlySeries,
}: {
  series: LinkedVehicleSeriesDto;
  isOnlySeries: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isOnlySeries);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-canvas">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center gap-2 px-[11px] py-[9px] text-left transition-colors hover:bg-bg-card focus-visible:outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-accent",
          isOpen && "border-b border-line",
        )}
      >
        <ChevronRight
          className={cn(
            "h-[11px] w-[11px] shrink-0 text-ink-4 transition-transform",
            isOpen && "rotate-90",
          )}
          aria-hidden="true"
        />
        {/* TecDoc leaves `modId` off a sparse vehicle, and every such row lands
            in one unnamed group rather than under a heading a visitor can
            read. */}
        <span className="text-[12.5px] font-semibold text-ink">
          {series.name || "Други модели"}
        </span>
        <span className="ml-auto rounded-full bg-bg-sunken px-[7px] py-0.5 text-[10.5px] font-semibold text-ink-3">
          {series.vehicles.length}
        </span>
      </button>

      {isOpen && <ModificationTable vehicles={series.vehicles} />}
    </div>
  );
}

function ModificationTable({ vehicles }: { vehicles: LinkedVehicleDto[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {["Модификация", "Мощност", "Години", "Гориво", "Код на двигател"].map(
              (heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="border-b border-line bg-bg-sunken px-3 py-[9px] text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3"
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => (
            <tr
              key={vehicle.vehicleId}
              className="border-b border-line last:border-b-0 hover:bg-bg-card"
            >
              <th
                scope="row"
                className="px-3 py-[9px] text-left font-medium text-ink"
              >
                {vehicle.name}
              </th>
              <td className="px-3 py-[9px] text-ink-2">
                {formatPower(vehicle.powerKw, vehicle.powerHp) ?? "—"}
              </td>
              <td className="px-3 py-[9px] font-mono text-ink-2">
                {formatYearSpan(vehicle.yearFrom, vehicle.yearTo) ?? "—"}
              </td>
              <td className="px-3 py-[9px] text-ink-2">
                {vehicle.fuelType ?? "—"}
              </td>
              <td className="px-3 py-[9px] font-mono text-ink-2">
                {/* Every code, not the first: a mechanic matching the one stamped
                    on the block against a shortened list concludes it does not
                    fit. */}
                {vehicle.engineCodes.join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VehiclesSkeleton({ testId }: { testId: string }) {
  return (
    <div
      className="flex max-w-[780px] flex-col gap-1.5"
      data-testid={testId}
      aria-busy="true"
    >
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="h-[42px] animate-pulse rounded-md border border-line bg-bg-sunken"
        />
      ))}
    </div>
  );
}

/**
 * `2005–2011`, or `2005–` while a model is still built. An en dash, not a
 * hyphen — it is a range, and TecDoc's own year spans read the same way.
 */
export function formatYearSpan(
  yearFrom: number | null,
  yearTo: number | null,
): string | null {
  if (yearFrom === null) {
    return yearTo === null ? null : `–${yearTo}`;
  }

  return `${yearFrom}–${yearTo ?? ""}`;
}

/** `130 kW / 177 hp`, falling back to whichever figure TecDoc filed. */
export function formatPower(
  powerKw: number | null,
  powerHp: number | null,
): string | null {
  const parts = [
    powerKw === null ? null : `${powerKw} kW`,
    powerHp === null ? null : `${powerHp} hp`,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" / ") : null;
}