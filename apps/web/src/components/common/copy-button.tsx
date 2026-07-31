"use client";

import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  /** Accessible label shown before a successful copy. */
  label: string;
  className?: string;
}

/**
 * Icon-only, transparent copy-to-clipboard button. Briefly swaps to a check
 * icon after a successful copy. Kept as a leaf client island so the components
 * that use it can stay Server Components.
 */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const { isCopied, copy } = useCopyToClipboard(value);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={isCopied ? "Копирано" : label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-muted transition-colors hover:bg-bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {isCopied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
