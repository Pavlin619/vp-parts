"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

const copyButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md bg-transparent text-muted transition-colors hover:bg-bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  {
    variants: {
      size: {
        default: "h-9 w-9 [&_svg]:h-4 [&_svg]:w-4",
        sm: "h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

interface CopyButtonProps extends VariantProps<typeof copyButtonVariants> {
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
export function CopyButton({ value, label, size, className }: CopyButtonProps) {
  const { isCopied, copy } = useCopyToClipboard(value);

  return (
    <button
      type="button"
      onClick={copy}
      title={label}
      aria-label={isCopied ? "Копирано" : label}
      className={cn(copyButtonVariants({ size, className }))}
    >
      {isCopied ? (
        <Check aria-hidden="true" />
      ) : (
        <Copy aria-hidden="true" />
      )}
    </button>
  );
}
