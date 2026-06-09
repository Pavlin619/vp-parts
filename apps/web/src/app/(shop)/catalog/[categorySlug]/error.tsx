"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function CategoryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      message="Грешка при зареждане на частите. Моля, опитайте отново."
      onRetry={reset}
    />
  );
}
