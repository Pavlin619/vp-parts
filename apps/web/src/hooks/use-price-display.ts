"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useHydration } from "./use-vehicle-context";

interface PriceDisplayState {
  /**
   * Whether prices are shown with VAT. Defaults to `true` because most visitors
   * are consumers and a VAT-exclusive figure they take for the final one is a
   * price we quoted 20% under.
   */
  includesVat: boolean;
  setIncludesVat: (includesVat: boolean) => void;
}

/**
 * Whether prices read with or without VAT — a trade customer comparing supplier
 * quotes works net, a consumer works gross, and neither should have to do the
 * arithmetic on every row.
 *
 * Persisted because it is a property of who the visitor is rather than of the
 * page they are on, and re-picking it on each search would make the preference
 * useless to the people who need it. Anything branching on it must render
 * behind `useHydration()`, or the server HTML (always the default) and the
 * first client render disagree.
 */
export const usePriceDisplay = create<PriceDisplayState>()(
  persist(
    (set) => ({
      includesVat: true,
      setIncludesVat: (includesVat) => set({ includesVat }),
    }),
    { name: "vp-price-display", version: 1 },
  ),
);

/**
 * The preference, as a price surface may read it: the default until hydration
 * completes, the stored choice after.
 *
 * `persist` rehydrates from `localStorage` while the module loads, so the first
 * client render of a component reading the store directly already holds the
 * stored value — which is a mismatch against server HTML that could only ever
 * carry the default. Everything showing a price goes through here rather than
 * subscribing to the store, so no surface can forget the guard.
 */
export function usePricesIncludeVat(): boolean {
  const isHydrated = useHydration();
  const includesVat = usePriceDisplay((state) => state.includesVat);

  return isHydrated ? includesVat : true;
}
