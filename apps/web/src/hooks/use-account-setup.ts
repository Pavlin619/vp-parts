"use client";

import { useAuth } from "@clerk/nextjs";
import { create } from "zustand";

export type AccountSetup = "ok" | "phone-required" | "failed";

export type AccountSetupStall = Exclude<AccountSetup, "ok">;

interface AccountSetupState {
  stall: { userId: string; accountSetup: AccountSetupStall } | null;
  /** Bumped by `resume`; the session sync runs again whenever it changes. */
  attempt: number;
  report: (userId: string, accountSetup: AccountSetupStall) => void;
  resume: () => void;
}

/**
 * What the session sync stalled on while setting up the signed-in account. Shared
 * so checkout's contact panel can ask for the phone where the customer is looking.
 */
export const useAccountSetupStore = create<AccountSetupState>((set) => ({
  stall: null,
  attempt: 0,
  report: (userId, accountSetup) => set({ stall: { userId, accountSetup } }),
  resume: () => set((state) => ({ stall: null, attempt: state.attempt + 1 })),
}));

export function useAccountSetup(): { accountSetup: AccountSetup; resume: () => void } {
  const { userId } = useAuth();
  const stall = useAccountSetupStore((state) => state.stall);
  const resume = useAccountSetupStore((state) => state.resume);

  return {
    accountSetup: stall !== null && stall.userId === userId ? stall.accountSetup : "ok",
    resume,
  };
}
