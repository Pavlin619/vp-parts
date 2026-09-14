"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  /** Highest selectable quantity — usually the line's stock ceiling. */
  max: number;
  min?: number;
  onChange: (quantity: number) => void;
  /**
   * Names the part in the control labels. Needed wherever several steppers
   * share a screen — a cart of five lines otherwise offers five buttons all
   * announced as "increase quantity".
   */
  itemLabel?: string;
  className?: string;
}

/**
 * The compact −/N/+ control. Shared by every surface that picks a quantity on a
 * row, so the ceiling, the disabled edges and the labels behave the same way in
 * a catalog list as in the cart.
 */
export function QuantityStepper({
  value,
  max,
  min = 1,
  onChange,
  itemLabel,
  className,
}: QuantityStepperProps) {
  const suffix = itemLabel ? ` за ${itemLabel}` : "";

  return (
    <div
      className={cn(
        "flex h-8 w-fit items-center rounded-md border border-line",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Намали количеството${suffix}`}
        className="h-8 w-[26px] rounded-l-md rounded-r-none text-ink"
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
      </Button>

      <span
        className="w-[26px] text-center font-display text-xs font-medium tabular-nums text-ink"
        aria-label={`Количество${suffix}`}
      >
        {value}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`Увеличи количеството${suffix}`}
        className="h-8 w-[26px] rounded-l-none rounded-r-md text-ink"
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
      </Button>
    </div>
  );
}
