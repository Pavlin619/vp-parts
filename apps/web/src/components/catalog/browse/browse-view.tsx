"use client";

import { useState } from "react";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import { useHydration, useVehicleContext } from "@/hooks/use-vehicle-context";
import { categoryScopeOf } from "@/lib/catalog/category-scope";
import { BrowseCategories } from "./categories";
import { VehiclePrompt } from "./vehicle-prompt";
import { VehicleHero } from "./vehicle-hero";

interface BrowseViewProps {
  /** The root category the URL narrows the page to, if it names one. */
  scopedCategoryId?: string;
}

/**
 * The catalogue: the car it is answering for, and the categories under it.
 *
 * A car narrows the page rather than unlocking it — without one the categories
 * are the catalogue-wide tree and the prompt takes the hero's place, so
 * removing a car widens the catalogue instead of emptying it, and the offer to
 * pick one again is on the same screen.
 *
 * Client-rendered because the vehicle lives in a persisted store the server
 * cannot read.
 */
export function BrowseView({ scopedCategoryId }: BrowseViewProps) {
  const isHydrated = useHydration();
  const vehicle = useVehicleContext((state) => state.selectedVehicle);
  const clearVehicle = useVehicleContext((state) => state.clearVehicle);

  const [isSelectorOpen, setSelectorOpen] = useState(false);

  // Which of the two trees to read is the store's answer, so the categories
  // wait for it as the hero does: starting the catalogue-wide read only to
  // replace it with the car's would pay for both and flash the wrong one.
  function renderCatalog() {
    if (!isHydrated) {
      return <VehicleHeroSkeleton />;
    }

    return (
      <>
        {vehicle ? (
          <VehicleHero
            vehicle={vehicle}
            onEdit={() => setSelectorOpen(true)}
            onClear={clearVehicle}
          />
        ) : (
          <VehiclePrompt onOpenSelector={() => setSelectorOpen(true)} />
        )}

        {/* Keyed so a new scope — or a new narrowing — starts on a cleared
            finder and a closed panel, rather than on the previous one's place
            in a tree it has left. */}
        <BrowseCategories
          key={`${vehicle?.vehicleId ?? "catalogue"}:${scopedCategoryId ?? ""}`}
          scope={categoryScopeOf(vehicle)}
          scopedCategoryId={scopedCategoryId}
        />
      </>
    );
  }

  return (
    <div className="page-container py-8">
      <h1 className="mb-6 font-display text-[44px] font-semibold leading-none tracking-[-0.025em]">
        Каталог
      </h1>

      {renderCatalog()}

      <VehicleSelector
        isOpen={isSelectorOpen}
        onClose={() => setSelectorOpen(false)}
        onConfirm={() => setSelectorOpen(false)}
      />
    </div>
  );
}

function VehicleHeroSkeleton() {
  return (
    <div
      className="mb-6 h-[248px] animate-pulse rounded-xl bg-bg-sunken"
      aria-label="Зареждане на автомобила"
      aria-busy="true"
    />
  );
}
