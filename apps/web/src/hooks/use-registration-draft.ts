"use client";

import { create } from "zustand";
import type { RegistrationValues } from "@/lib/auth/registration-values";

export type RegistrationDraft = Partial<Omit<RegistrationValues, "password">>;

interface RegistrationDraftState {
  draft: RegistrationDraft;

  setDraft: (draft: RegistrationDraft) => void;
  clear: () => void;
}

/**
 * Details handed to the registration form from elsewhere — a guest's quick
 * order — so they need not be typed twice. Held in memory only.
 */
export const useRegistrationDraft = create<RegistrationDraftState>()((set) => ({
  draft: {},

  setDraft: (draft) => set({ draft }),
  clear: () => set({ draft: {} }),
}));
