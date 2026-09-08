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
   * one. Empty for a car TecDoc files no code for.
   */
  engineCodes: string[];
  powerKw: number;
  /** Null where TecDoc files no figure. */
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
    { name: "vp-vehicle-context" },
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
