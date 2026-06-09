"use client";

import { useState } from "react";
import { ChevronDown, Camera, Info, Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import { useVehicleContext, useHydration } from "@/hooks/use-vehicle-context";
import { cn } from "@/lib/utils";

type Mode = "manual" | "vin" | "plate";

export function VehicleFinderCard() {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("manual");

  const isHydrated = useHydration();
  const selectedVehicle = useVehicleContext((state) => state.selectedVehicle);
  const recentVehicles = useVehicleContext((state) => state.recentVehicles);
  const setVehicle = useVehicleContext((state) => state.setVehicle);

  const vehicle = isHydrated ? selectedVehicle : null;
  const recents = isHydrated ? recentVehicles.slice(0, 3) : [];

  const MODES: [Mode, string][] = [
    ["manual", "Ръчно"],
    ["vin", "VIN"],
    ["plate", "Рег. №"],
  ];

  return (
    <>
      <div className="bg-bg-card rounded-[16px] shadow-[0_4px_12px_rgba(11,18,32,0.06)] p-6">
        {/* Header */}
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
                  mode === m
                    ? "bg-bg-card text-ink shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "manual" && (
          <div className="space-y-3">
            {/* Марка dropdown */}
            <div>
              <div
                className={cn(
                  "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5",
                  vehicle ? "text-ok" : "text-muted",
                )}
              >
                {vehicle && <Check className="w-3 h-3" aria-hidden="true" />}
                Марка
              </div>
              <button
                onClick={() => setSelectorOpen(true)}
                className="w-full flex items-center justify-between h-12 px-4 bg-bg-card border border-line rounded-lg hover:border-ink-3 transition-colors text-left"
              >
                <span
                  className={cn(
                    "text-sm font-medium",
                    vehicle ? "text-ink" : "text-muted",
                  )}
                >
                  {vehicle ? vehicle.manufacturerName : "Избери марка"}
                </span>
                <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" aria-hidden="true" />
              </button>
            </div>

            {/* Модел + Двигател dropdowns */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5",
                    vehicle ? "text-ok" : "text-muted",
                  )}
                >
                  {vehicle && <Check className="w-3 h-3" aria-hidden="true" />}
                  Модел
                </div>
                <button
                  onClick={() => setSelectorOpen(true)}
                  className="w-full flex items-center justify-between h-12 px-4 bg-bg-card border border-line rounded-lg hover:border-ink-3 transition-colors text-left"
                >
                  <span
                    className={cn(
                      "text-sm font-medium truncate",
                      vehicle ? "text-ink" : "text-muted",
                    )}
                  >
                    {vehicle ? vehicle.seriesName : "Модел"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted flex-shrink-0 ml-2" aria-hidden="true" />
                </button>
              </div>

              <div>
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5",
                    vehicle ? "text-ok" : "text-muted",
                  )}
                >
                  {vehicle && <Check className="w-3 h-3" aria-hidden="true" />}
                  Двигател
                </div>
                <button
                  onClick={() => setSelectorOpen(true)}
                  className="w-full flex items-center justify-between h-12 px-4 bg-bg-card border border-line rounded-lg hover:border-ink-3 transition-colors text-left"
                >
                  <span
                    className={cn(
                      "text-sm font-medium truncate",
                      vehicle ? "text-ink" : "text-muted",
                    )}
                  >
                    {vehicle ? vehicle.variantName : "Двигател"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted flex-shrink-0 ml-2" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIN / Plate input */}
        {(mode === "vin" || mode === "plate") && (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={mode === "vin" ? "ВЪВЕДИ VIN (17 СИМВОЛА)" : "ВЪВЕДИ РЕГ. НОМЕР"}
              className="flex-1 h-14 px-4 bg-bg-card border border-line rounded-lg text-sm text-ink placeholder:text-muted/60 uppercase tracking-widest focus:outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(11,18,32,0.06)]"
            />
            {mode === "vin" && (
              <button className="w-14 h-14 flex items-center justify-center border border-line rounded-lg hover:bg-bg-sunken transition-colors flex-shrink-0">
                <Camera className="w-5 h-5 text-muted" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* "или" divider + VIN input (manual mode only) */}
        {mode === "manual" && (
          <div className="my-5">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-line" />
              <span className="text-xs text-muted">или</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                placeholder="ВЪВЕДИ VIN (17 СИМВОЛА)"
                className="flex-1 h-14 px-4 bg-bg-card border border-line rounded-lg text-sm text-ink placeholder:text-muted/60 uppercase tracking-widest focus:outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(11,18,32,0.06)]"
              />
              <button className="w-14 h-14 flex items-center justify-center border border-line rounded-lg hover:bg-bg-sunken transition-colors flex-shrink-0">
                <Camera className="w-5 h-5 text-muted" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Recent vehicles */}
        {recents.length > 0 && (
          <div
            className={cn(
              "flex items-center gap-3 flex-wrap",
              mode === "manual" ? "mb-5" : "my-5",
            )}
          >
            <div className="flex items-center gap-1.5 text-xs text-muted flex-shrink-0">
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
              Последни:
            </div>
            <div className="flex gap-2 flex-wrap">
              {recents.map((v) => (
                <button
                  key={v.vehicleId}
                  onClick={() => setVehicle(v)}
                  className="px-3 py-1.5 border border-line rounded-full text-xs font-medium text-ink hover:bg-bg-sunken transition-colors"
                >
                  {v.manufacturerName} {v.seriesName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
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
