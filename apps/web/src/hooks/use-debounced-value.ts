"use client";

import { useEffect, useState } from "react";

/**
 * Returns the given value only after it has stayed unchanged for `delayMs`.
 * Changing the value mid-delay restarts the timer.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
