"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import { useHydration, useVehicleContext } from "@/hooks/use-vehicle-context";
import { VehicleFinderManual } from "./vehicle-finder-manual";
import { RecentVehiclesList } from "./recent-vehicles-list";

/** One definition for both states of the call to action, which differ only in text. */
const CALL_TO_ACTION =
  "flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-white transition-colors hover:bg-accent-hover";

export function VehicleFinderCard() {
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const isHydrated = useHydration();
  const selectedVehicle = useVehicleContext((state) => state.selectedVehicle);
  // The vehicle lives in `localStorage`, so the server cannot know there is one.
  // Rendering as though there is none keeps the first client paint identical to
  // the server's, and it is the honest state to show while we do not know.
  const vehicle = isHydrated ? selectedVehicle : null;

  const openSelector = () => setIsSelectorOpen(true);

  return (
    <>
      <div className="bg-bg-card rounded-[16px] shadow-[0_4px_12px_rgba(11,18,32,0.06)] p-6">
        <h2 className="font-display font-semibold text-ink text-lg leading-tight mb-6">
          Намери части за твоята кола
        </h2>

        {/* The parent owns the rhythm rather than each child carrying its own
            margin, because the recents list renders nothing when there are
            none and its margin would collapse the gap it was part of. */}
        <div className="space-y-5">
          <VehicleFinderManual vehicle={vehicle} onOpenSelector={openSelector} />

          <RecentVehiclesList />

          {vehicle ? (
            <Link href="/catalog" className={CALL_TO_ACTION}>
              Към каталога
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          ) : (
            // The catalogue is one click away in the nav; what this card is for
            // is the vehicle, so until there is one the button does that job
            // instead of promising a listing of everything.
            <button onClick={openSelector} className={CALL_TO_ACTION}>
              Избери автомобил
            </button>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-line flex items-center justify-center gap-2">
          <span className="text-[10px] text-muted">Данните за автомобили са предоставени от</span>
          <span className="font-mono text-[10px] font-semibold text-muted uppercase">
            TecDoc Inside™
          </span>
        </div>
      </div>

      <VehicleSelector isOpen={isSelectorOpen} onClose={() => setIsSelectorOpen(false)} />
    </>
  );
}
