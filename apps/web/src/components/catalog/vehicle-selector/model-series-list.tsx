import { ArrowRight } from "lucide-react";
import type { ModelSeriesDto } from "@vp-parts-shop/shared";
import { formatYearRange } from "@/lib/catalog/vehicle-specs";

interface ModelSeriesListProps {
  series: ModelSeriesDto[];
  onSelect: (series: ModelSeriesDto) => void;
}

/**
 * The model step: a make's series, each with the years it was built.
 *
 * The years are what tell two rows apart, because a series name is a factory
 * code a visitor rarely knows — AUDI files 133 of them and MERCEDES-BENZ 248,
 * several with names differing only in the body ("80 B4 Седан" against "80 B4
 * Avant"). They come from the same facet as the names, so they cost nothing.
 *
 * A thumbnail per row was built here and removed: see `docs/TECDOC.md` for the
 * measurements, and do not restore it without reading them.
 */
export function ModelSeriesList({ series, onSelect }: ModelSeriesListProps) {
  return (
    <ul className="space-y-0.5" role="list" aria-label="Модели">
      {series.map((entry) => (
        <li key={entry.id}>
          <button
            onClick={() => onSelect(entry)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-sunken"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {entry.name}
              </span>
              <span className="block text-xs text-muted">
                {formatYearRange(entry.yearFrom, entry.yearTo)}
              </span>
            </span>

            {/* The row drills into the engine step rather than picking a car,
                which is the one thing the make cards and engine rows do not do. */}
            <ArrowRight
              className="h-4 w-4 flex-shrink-0 text-muted"
              aria-hidden="true"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
