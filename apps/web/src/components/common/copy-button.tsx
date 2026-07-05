"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  /** Accessible label shown before a successful copy. */
  label: string;
  className?: string;
}

const COPIED_RESET_MS = 2000;

/**
 * Icon-only, transparent copy-to-clipboard button. Briefly swaps to a check
 * icon after a successful copy. Kept as a leaf client island so the components
 * that use it can stay Server Components.
 */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel a pending reset if the button unmounts before it fires, so we never
  // call setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
      resetTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — leave the state as is.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Копирано" : label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-muted transition-colors hover:bg-bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
