"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import { cn } from "@/lib/utils";
import { VehicleFinderManual } from "./vehicle-finder-manual";
import { VehicleFinderSearchInput } from "./vehicle-finder-search-input";
import { RecentVehiclesList } from "./recent-vehicles-list";

type Mode = "manual" | "vin" | "plate";

const MODES: [Mode, string][] = [
  ["manual", "Ръчно"],
  ["vin", "VIN"],
  ["plate", "Рег. №"],
];

export function VehicleFinderCard() {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("manual");

  return (
    <>
      <div className="bg-bg-card rounded-[16px] shadow-[0_4px_12px_rgba(11,18,32,0.06)] p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h2 className="font-display font-semibold text-ink text-lg leading-tight">
            Намери части за твоята кола
          </h2>
          <div className="flex items-center bg-bg-sunken rounded-lg p-0.5 flex-shrink-0 text-sm">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-3 py-1.5 rounded-md font-medium transition-colors",
                  mode === m ? "bg-bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "manual" && (
          <VehicleFinderManual onOpenSelector={() => setSelectorOpen(true)} />
        )}

        {(mode === "vin" || mode === "plate") && (
          <VehicleFinderSearchInput
            placeholder={mode === "vin" ? "ВЪВЕДИ VIN (17 СИМВОЛА)" : "ВЪВЕДИ РЕГ. НОМЕР"}
            showCamera={mode === "vin"}
          />
        )}

        <RecentVehiclesList mode={mode} />

        <Link
          href="/catalog"
          className="flex items-center justify-center gap-2 w-full h-12 bg-accent text-white rounded-lg font-semibold hover:bg-accent-hover transition-colors"
        >
          Към каталога
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>

        <div className="mt-4 pt-4 border-t border-line flex items-center justify-center gap-2">
          <span className="text-[10px] text-muted">Данните за автомобили са предоставени от</span>
          <span className="font-mono text-[10px] font-semibold text-muted uppercase">
            TecDoc Inside™
          </span>
        </div>
      </div>

      <VehicleSelector isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} />
    </>
  );
}
