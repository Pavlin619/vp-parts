"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function ArticleDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      message="Грешка при зареждане на частта. Моля, опитайте отново."
      onRetry={reset}
    />
  );
}
