"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type { LinkedVehicleDto } from "@vp-parts-shop/shared";
import { linkedVehiclesQueryOptions } from "@/lib/api/catalog";
import { cn } from "@/lib/utils";

interface ArticleRowVehiclesProps {
  /**
   * The article's TecDoc brand. Required alongside the number because linkages
   * are per part and a number can belong to more than one — without it the
   * section can show another company's vehicles.
   */
  brandId: string;
  articleNumber: string;
}

export interface LinkedVehicleSeriesGroup {
  modelSeriesName: string;
  /** Span across the modifications listed, not a separate TecDoc field. */
  yearFrom: number | null;
  yearTo: number | null;
  vehicles: LinkedVehicleDto[];
}

export interface LinkedVehicleMakeGroup {
  manufacturerName: string;
  series: LinkedVehicleSeriesGroup[];
  vehicleCount: number;
}

/**
 * The applicable-vehicles section of a catalog row.
 *
 * Unlike the other sections of the expander, this data does not ride along on
 * the catalog response — a common service part fits thousands of modifications,
 * far more than the row it belongs to. So it is read on demand: this component
 * only mounts once the section is opened, which is what triggers the fetch.
 * The query cache is what makes reopening it — or opening it on another row for
 * the same part — free.
 */
export function ArticleRowVehicles({
  brandId,
  articleNumber,
}: ArticleRowVehiclesProps) {
  const { data, isPending, isError, refetch } = useQuery(
    linkedVehiclesQueryOptions(brandId, articleNumber),
  );

  if (isPending) {
    return <VehiclesSkeleton />;
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-[13px]">
        <p className="text-ink-3">
          В момента не можем да заредим приложимите автомобили.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Опитай отново
        </button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-2 bg-canvas p-5 text-[13px] text-ink-3">
        Няма данни за приложими автомобили за този артикул.
      </p>
    );
  }

  return <VehicleGroups groups={groupLinkedVehicles(data)} />;
}

/**
 * Make → series → modification, two levels of disclosure, so a part that fits
 * BMW, Mercedes and VW stays scannable instead of unrolling into one long
 * table. The first make and its first series open by default: something has to
 * be on screen when the section opens, and the alternative — everything open —
 * is the flat table this structure exists to avoid.
 */
function VehicleGroups({ groups }: { groups: LinkedVehicleMakeGroup[] }) {
  const [openMakes, setOpenMakes] = useState<Set<string> | null>(null);
  const [openSeries, setOpenSeries] = useState<Set<string> | null>(null);

  const isMakeOpen = (make: string, index: number) =>
    openMakes ? openMakes.has(make) : index === 0;

  const isSeriesOpen = (key: string, isFirstOfFirstMake: boolean) =>
    openSeries ? openSeries.has(key) : isFirstOfFirstMake;

  const toggleMake = (make: string) =>
    setOpenMakes((open) => toggled(open ?? defaultOpenMakes(groups), make));

  const toggleSeries = (key: string) =>
    setOpenSeries((open) => toggled(open ?? defaultOpenSeries(groups), key));

  return (
    <div className="max-w-[780px]">
      {groups.map((group, groupIndex) => {
        const isOpen = isMakeOpen(group.manufacturerName, groupIndex);

        return (
          <div
            key={group.manufacturerName}
            className="mb-1.5 overflow-hidden rounded-md border border-line bg-canvas last:mb-0"
          >
            <button
              type="button"
              onClick={() => toggleMake(group.manufacturerName)}
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
                {group.manufacturerName}
              </span>
              <span className="ml-auto text-[11.5px] text-ink-3">
                {countLabel(group.series.length, "модел", "модела")} ·{" "}
                {countLabel(
                  group.vehicleCount,
                  "модификация",
                  "модификации",
                )}
              </span>
            </button>

            {isOpen && (
              <div className="flex flex-col gap-1.5 p-2">
                {group.series.map((series, seriesIndex) => (
                  <SeriesDisclosure
                    key={series.modelSeriesName}
                    series={series}
                    isOpen={isSeriesOpen(
                      seriesKey(group.manufacturerName, series),
                      groupIndex === 0 && seriesIndex === 0,
                    )}
                    onToggle={() =>
                      toggleSeries(seriesKey(group.manufacturerName, series))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SeriesDisclosure({
  series,
  isOpen,
  onToggle,
}: {
  series: LinkedVehicleSeriesGroup;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const yearSpan = formatYearSpan(series.yearFrom, series.yearTo);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-canvas">
      <button
        type="button"
        onClick={onToggle}
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
        <span className="text-[12.5px] font-semibold text-ink">
          {series.modelSeriesName}
        </span>
        {yearSpan && (
          <span className="font-mono text-[11px] text-ink-3">{yearSpan}</span>
        )}
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
                {vehicle.engineCode ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VehiclesSkeleton() {
  return (
    <div
      className="flex max-w-[780px] flex-col gap-1.5"
      data-testid="article-row-vehicles-skeleton"
      aria-hidden="true"
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
 * Groups the flat linkage rows into make → series, keeping TecDoc's order at
 * both levels. The series year span is derived from the modifications listed
 * rather than read from a field of its own: it is the span of what this part
 * actually fits, which is the narrower and more useful claim.
 */
export function groupLinkedVehicles(
  vehicles: LinkedVehicleDto[],
): LinkedVehicleMakeGroup[] {
  const groups: LinkedVehicleMakeGroup[] = [];

  for (const vehicle of vehicles) {
    let make = groups.find(
      (group) => group.manufacturerName === vehicle.manufacturerName,
    );

    if (!make) {
      make = {
        manufacturerName: vehicle.manufacturerName,
        series: [],
        vehicleCount: 0,
      };
      groups.push(make);
    }

    let series = make.series.find(
      (candidate) => candidate.modelSeriesName === vehicle.modelSeriesName,
    );

    if (!series) {
      series = {
        modelSeriesName: vehicle.modelSeriesName,
        yearFrom: null,
        yearTo: null,
        vehicles: [],
      };
      make.series.push(series);
    }

    series.vehicles.push(vehicle);
    make.vehicleCount += 1;
  }

  for (const make of groups) {
    for (const series of make.series) {
      series.yearFrom = earliestYear(series.vehicles);
      series.yearTo = latestYear(series.vehicles);
    }
  }

  return groups;
}

function earliestYear(vehicles: LinkedVehicleDto[]): number | null {
  const years = vehicles
    .map((vehicle) => vehicle.yearFrom)
    .filter((year): year is number => year !== null);

  return years.length > 0 ? Math.min(...years) : null;
}

/**
 * A single modification still in production leaves the whole series open-ended,
 * so one `null` end year wins over every dated one.
 */
function latestYear(vehicles: LinkedVehicleDto[]): number | null {
  const dated = vehicles.filter((vehicle) => vehicle.yearFrom !== null);
  const stillMade = dated.some((vehicle) => vehicle.yearTo === null);

  if (dated.length === 0 || stillMade) {
    return null;
  }

  return Math.max(...dated.map((vehicle) => vehicle.yearTo as number));
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

/** Bulgarian counts take the plural from two onwards, e.g. 1 модел / 2 модела. */
function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function seriesKey(
  manufacturerName: string,
  series: LinkedVehicleSeriesGroup,
): string {
  return `${manufacturerName}|${series.modelSeriesName}`;
}

function defaultOpenMakes(groups: LinkedVehicleMakeGroup[]): Set<string> {
  return new Set(groups.length > 0 ? [groups[0].manufacturerName] : []);
}

function defaultOpenSeries(groups: LinkedVehicleMakeGroup[]): Set<string> {
  const first = groups[0];

  return new Set(
    first && first.series.length > 0
      ? [seriesKey(first.manufacturerName, first.series[0])]
      : [],
  );
}

function toggled(open: Set<string>, key: string): Set<string> {
  const next = new Set(open);

  if (!next.delete(key)) {
    next.add(key);
  }

  return next;
}
