"use client";

import { useState } from "react";
import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import { useHydration, useVehicleContext } from "@/hooks/use-vehicle-context";
import type { BreadcrumbItem } from "@/lib/breadcrumbs";
import { VehiclePrompt } from "./vehicle-prompt";
import { VehicleHero } from "./vehicle-hero";

const CATALOG_TRAIL: BreadcrumbItem[] = [
  { key: "home", label: "Начало", href: "/" },
  { key: "catalog", label: "Каталог" },
];

/**
 * The catalog: for now the car everything below it will be scoped to.
 *
 * Client-rendered because the vehicle lives in a persisted store the server
 * cannot read.
 */
export function BrowseView() {
  const isHydrated = useHydration();
  const vehicle = useVehicleContext((state) => state.selectedVehicle);
  const clearVehicle = useVehicleContext((state) => state.clearVehicle);

  const [isSelectorOpen, setSelectorOpen] = useState(false);

  function renderVehicle() {
    if (!isHydrated) {
      return <VehicleHeroSkeleton />;
    }

    if (!vehicle) {
      return <VehiclePrompt onOpenSelector={() => setSelectorOpen(true)} />;
    }

    return (
      <VehicleHero
        vehicle={vehicle}
        onEdit={() => setSelectorOpen(true)}
        onClear={clearVehicle}
      />
    );
  }

  return (
    <div className="page-container pb-8">
      <Breadcrumbs items={CATALOG_TRAIL} />

      <h1 className="mb-6 pt-3.5 font-display text-[44px] font-semibold leading-none tracking-[-0.025em]">
        Каталог
      </h1>

      {renderVehicle()}

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
