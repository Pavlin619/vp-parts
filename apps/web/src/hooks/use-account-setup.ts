"use client";

import { useAuth } from "@clerk/nextjs";
import { create } from "zustand";

export type AccountSetup = "ok" | "failed";

interface AccountSetupState {
  /** The account the session sync could never file as a customer. */
  failedUserId: string | null;
  reportFailed: (userId: string) => void;
}

/**
 * Whether the session sync could file the signed-in account. Shared so
 * checkout's contact panel can say so where the customer is looking.
 */
export const useAccountSetupStore = create<AccountSetupState>((set) => ({
  failedUserId: null,
  reportFailed: (userId) => set({ failedUserId: userId }),
}));

export function useAccountSetup(): AccountSetup {
  const { userId } = useAuth();
  const failedUserId = useAccountSetupStore((state) => state.failedUserId);

  return failedUserId !== null && failedUserId === userId ? "failed" : "ok";
}
