"use client";

import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";

const STALE_TITLE = "Показаните цени и наличности може да не са актуални.";

interface CartAvailabilityErrorProps {
  /** Whether figures from an earlier read are still on screen. */
  hasPrices: boolean;
  /** What to say when no figures were ever read, naming the surface. */
  unloadedTitle: string;
  onRetry: () => void;
}

/**
 * The retry prompt for a failed cart read. A failed *re*-read keeps the figures
 * already on screen, so it says they may be stale rather than that they are
 * missing.
 */
export function CartAvailabilityError({
  hasPrices,
  unloadedTitle,
  onRetry,
}: CartAvailabilityErrorProps) {
  return (
    <AvailabilityLoadError
      onRetry={onRetry}
      title={hasPrices ? STALE_TITLE : unloadedTitle}
      className="mb-6 rounded-[12px] border border-line bg-bg-card py-6"
    />
  );
}
