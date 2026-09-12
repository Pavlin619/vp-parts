"use client";

import { Car } from "lucide-react";

/**
 * What stands where the hero would, while no car is picked.
 *
 * An invitation rather than a gate: the categories below it are the
 * catalogue-wide tree, so the page is browsable without a car. What a car
 * changes is the answer — TecDoc files the tree per vehicle, and an Audi A3
 * gets 35 roots of the catalogue's 36 while a Tesla Model 3 gets a different
 * set — which is why the offer stays on screen on every category page, not
 * only the first.
 */
export function VehiclePrompt({ onOpenSelector }: { onOpenSelector: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3.5 rounded-xl border border-line bg-bg-card p-[18px]">
      <span className="hatched grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-line bg-bg-sunken text-ink-3">
        <Car className="h-5 w-5" aria-hidden="true" />
      </span>

      <div className="min-w-[260px] flex-1">
        <p className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">
          Изберете автомобил
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          Показваме всички категории в каталога. С избран автомобил остават само
          категориите и частите, които пасват на него.
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenSelector}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        <Car className="h-4 w-4" aria-hidden="true" />
        Избери автомобил
      </button>
    </div>
  );
}
