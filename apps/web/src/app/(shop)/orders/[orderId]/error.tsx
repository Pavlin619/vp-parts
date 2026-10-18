"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function OrderError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState message="Грешка при зареждане на поръчката. Моля, опитайте отново." onRetry={reset} />
  );
}
