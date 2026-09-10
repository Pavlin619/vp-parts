"use client";

import { Car } from "lucide-react";

/**
 * What the catalog shows before a car is picked.
 *
 * There is no vehicle-less category list to fall back to: TecDoc answers the
 * tree per vehicle, and that is the point — an Audi A3 gets 35 roots and a
 * Tesla Model 3 a different set, so nothing is offered that the car cannot take.
 */
export function VehiclePrompt({ onOpenSelector }: { onOpenSelector: () => void }) {
  return (
    <div className="mb-14 flex flex-col items-center gap-4 rounded-lg border border-line bg-bg-card px-6 py-16 text-center">
      <span className="hatched grid h-16 w-16 place-items-center rounded-xl border border-line bg-bg-sunken text-ink-3">
        <Car className="h-7 w-7" aria-hidden="true" />
      </span>

      <div>
        <p className="font-display text-lg font-semibold text-ink">
          Изберете автомобил
        </p>
        <p className="mt-1 max-w-md text-sm text-ink-3">
          Категориите се различават за всеки модел, затова каталогът показва само
          тези, за които има части за вашата кола.
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenSelector}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        <Car className="h-4 w-4" aria-hidden="true" />
        Избери автомобил
      </button>
    </div>
  );
}
