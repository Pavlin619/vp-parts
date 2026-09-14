"use client";

import { useEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name — the box carries no visible text of its own. */
  label: string;
  /**
   * Some but not all of what this box stands for is checked. Set on a
   * select-all so it never claims a partial selection is a whole one.
   */
  indeterminate?: boolean;
  className?: string;
}

/**
 * A checkbox drawn as a filled square. Wraps a real `<input type="checkbox">`
 * kept visually hidden rather than replaced, so keyboard, form semantics and
 * the indeterminate state all come from the platform.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate = false,
  className,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // `indeterminate` exists only as a DOM property; there is no attribute for it.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const isFilled = checked || indeterminate;

  return (
    <label className={cn("inline-flex cursor-pointer items-center", className)}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid h-[18px] w-[18px] place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
          isFilled
            ? "border-ink bg-ink text-white"
            : "border-line-2 bg-bg-card",
        )}
      >
        {isFilled &&
          (indeterminate ? (
            <Minus className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          ))}
      </span>
    </label>
  );
}
