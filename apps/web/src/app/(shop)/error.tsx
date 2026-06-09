"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function ShopError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState message="Нещо се обърка. Моля, опитайте отново." onRetry={reset} />
  );
}
