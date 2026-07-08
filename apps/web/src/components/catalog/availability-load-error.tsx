"use client";

import { PackageX } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvailabilityLoadErrorProps {
  /** Re-runs the failed availability read in place (a TanStack Query refetch). */
  onRetry: () => void;
  title?: string;
  message?: string;
  className?: string;
}

/**
 * Scoped "try again" state for a client-side availability read that failed
 * closed (503 / INVENTORY_UNAVAILABLE). Shared by every surface that fetches
 * live price/stock — the buy box, listing grid, and substitutes — so a
 * transient stock-DB blip degrades only that section rather than the page.
 * Retrying calls `onRetry` (a query `refetch`), so recovery needs no reload.
 */
export function AvailabilityLoadError({
  onRetry,
  title = "В момента не можем да заредим наличността.",
  message = "Възникна временен проблем с наличностите. Моля, опитайте отново.",
  className,
}: AvailabilityLoadErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 py-10 text-center",
        className,
      )}
    >
      <PackageX className="h-9 w-9 text-muted" aria-hidden="true" />

      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Опитай отново
      </button>
    </div>
  );
}
