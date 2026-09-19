"use client";

import { create } from "zustand";

interface CartDrawerState {
  isOpen: boolean;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
}

/**
 * Whether the cart drawer is up.
 *
 * Its own store rather than state in the header, because the surfaces that open
 * it are nowhere near the surface that renders it: a row's add-to-cart button
 * lives deep inside a results list, and threading a callback down to it through
 * every list surface is a way for them to disagree about what adding a part
 * does. Deliberately not persisted — a drawer left open in a previous visit is
 * not a preference.
 */
export const useCartDrawer = create<CartDrawerState>()((set) => ({
  isOpen: false,
  openCartDrawer: () => set({ isOpen: true }),
  closeCartDrawer: () => set({ isOpen: false }),
}));
