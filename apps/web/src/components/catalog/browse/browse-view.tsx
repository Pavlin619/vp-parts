"use client";

import { useState } from "react";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import { useHydration, useVehicleContext } from "@/hooks/use-vehicle-context";
import { BrowseCategories } from "./categories";
import { VehiclePrompt } from "./vehicle-prompt";
import { VehicleHero } from "./vehicle-hero";

/**
 * The catalogue: the car everything below it is scoped to, and that car's
 * categories.
 *
 * Client-rendered because the vehicle lives in a persisted store the server
 * cannot read.
 */
export function BrowseView() {
  const isHydrated = useHydration();
  const vehicle = useVehicleContext((state) => state.selectedVehicle);
  const clearVehicle = useVehicleContext((state) => state.clearVehicle);

  const [isSelectorOpen, setSelectorOpen] = useState(false);

  function renderCatalog() {
    if (!isHydrated) {
      return <VehicleHeroSkeleton />;
    }

    if (!vehicle) {
      return <VehiclePrompt onOpenSelector={() => setSelectorOpen(true)} />;
    }

    return (
      <>
        <VehicleHero
          vehicle={vehicle}
          onEdit={() => setSelectorOpen(true)}
          onClear={clearVehicle}
        />

        {/* Keyed so a new car starts on a cleared finder and a closed panel,
            rather than on the previous car's place in a tree it has left. */}
        <BrowseCategories key={vehicle.vehicleId} vehicle={vehicle} />
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
