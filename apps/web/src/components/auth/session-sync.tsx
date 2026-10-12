"use client";

import { useSessionSync } from "@/hooks/use-session-sync";

/**
 * Files the signed-in customer, merges a guest cart into theirs, and clears a
 * device that has signed out. Renders nothing: an account it cannot finish
 * setting up is shown in checkout's contact panel, where the order needs it.
 */
export function SessionSync() {
  useSessionSync();

  return null;
}
