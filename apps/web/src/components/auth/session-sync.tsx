"use client";

import { useSessionSync } from "@/hooks/use-session-sync";
import { AccountSetupFailed } from "./account-setup-failed";

/**
 * Files the signed-in customer, merges a guest cart into theirs, and clears a
 * device that has signed out. Renders nothing unless the account cannot be set
 * up at all.
 */
export function SessionSync() {
  const { hasAccountSetupFailed } = useSessionSync();

  return hasAccountSetupFailed ? <AccountSetupFailed /> : null;
}
