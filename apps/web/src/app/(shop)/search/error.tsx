"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function SearchError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      message="Грешка при търсенето. Моля, опитайте отново."
      onRetry={reset}
    />
  );
}
