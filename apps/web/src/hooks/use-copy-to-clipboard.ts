"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a successful copy stays confirmed on screen. */
export const COPIED_RESET_MS = 2000;

interface CopyToClipboard {
  /** True for a short window after a successful copy. */
  isCopied: boolean;
  copy: () => Promise<void>;
}

/**
 * Copies a value and reports the short-lived "copied" confirmation that goes
 * with it, so every copy affordance in the app times out the same way and none
 * of them claim a copy the browser refused.
 */
export function useCopyToClipboard(value: string): CopyToClipboard {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel a pending reset if the caller unmounts before it fires, so we never
  // set state on an unmounted component.
  useEffect(
    () => () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions). The
      // value stays on screen, so there is nothing to recover.
      return;
    }

    setIsCopied(true);

    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }

    resetTimer.current = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
  }, [value]);

  return { isCopied, copy };
}
