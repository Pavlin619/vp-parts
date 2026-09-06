"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SelectedVehicle {
  vehicleId: string;
  manufacturerId: string;
  seriesId: string;
  manufacturerName: string;
  seriesName: string;
  variantName: string;
  /**
   * Every engine code the car was built with — a third of them have more than
   * one. Empty for a car TecDoc files no code for, and for one saved before
   * this existed.
   */
  engineCodes: string[];
  powerKw: number;
  /** Null where TecDoc files no figure, and for a car saved before this existed. */
  powerHp: number | null;
  yearFrom: number;
  yearTo: number | null;
}

interface VehicleContextState {
  selectedVehicle: SelectedVehicle | null;
  recentVehicles: SelectedVehicle[];
  setVehicle: (vehicle: SelectedVehicle) => void;
  clearVehicle: () => void;
}

/**
 * Horsepower joined the saved vehicle after cars had already been saved without
 * it. Absent has to read as unknown rather than as a reason to forget the car:
 * `formatPower` prints the kilowatts on their own, and the next pass through the
 * selector fills the figure in.
 */
function withKnownPower(vehicle: SelectedVehicle): SelectedVehicle {
  return { ...vehicle, powerHp: vehicle.powerHp ?? null };
}

/**
 * A car saved before a vehicle was known to have several engines holds the
 * first code as a bare `engine` string. That is still a true code, so it is
 * promoted into the list rather than dropped — the next pass through the
 * selector fills in the rest.
 */
function withEngineCodes(vehicle: SelectedVehicle): SelectedVehicle {
  const singleCode = (vehicle as SelectedVehicle & { engine?: string }).engine;

  return {
    ...vehicle,
    engineCodes: vehicle.engineCodes ?? (singleCode ? [singleCode] : []),
  };
}

function migrateVehicle(vehicle: SelectedVehicle): SelectedVehicle {
  return withEngineCodes(withKnownPower(vehicle));
}

export const useVehicleContext = create<VehicleContextState>()(
  persist(
    (set) => ({
      selectedVehicle: null,
      recentVehicles: [],
      setVehicle: (vehicle) =>
        set((state) => ({
          selectedVehicle: vehicle,
          recentVehicles: [
            vehicle,
            ...state.recentVehicles.filter((v) => v.vehicleId !== vehicle.vehicleId),
          ].slice(0, 3),
        })),
      clearVehicle: () => set({ selectedVehicle: null }),
    }),
    {
      name: "vp-vehicle-context",
      version: 3,
      migrate: (stored) => {
        const state = stored as Partial<VehicleContextState>;
        const vehicle = state.selectedVehicle;
        if (vehicle && (!vehicle.manufacturerId || !vehicle.seriesId)) {
          return { ...state, selectedVehicle: null, recentVehicles: [] };
        }
        return {
          ...state,
          selectedVehicle: vehicle ? migrateVehicle(vehicle) : null,
          recentVehicles: state.recentVehicles?.map(migrateVehicle) ?? [],
        };
      },
    },
  ),
);

const returnTrue = () => true;
const returnFalse = () => false;
const noopSubscribe = () => () => {};

/**
 * Returns `true` only on the client (after hydration), `false` on the server.
 * Use this to guard components that branch on Zustand persisted state, so the
 * server HTML and the initial client render stay identical and React does not
 * report a hydration mismatch. Render a neutral skeleton when this is `false`.
 */
export function useHydration(): boolean {
  return useSyncExternalStore(noopSubscribe, returnTrue, returnFalse);
}
