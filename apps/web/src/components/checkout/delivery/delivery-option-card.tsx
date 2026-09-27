import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DeliveryOptionCardProps {
  /** The radio group this card belongs to. */
  name: string;
  value: string;
  label: string;
  description: string;
  icon: ReactNode;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * One choosable option drawn as a card. A native radio sits underneath, so the
 * group keeps arrow-key navigation and screen readers announce it as a choice.
 */
export function DeliveryOptionCard({
  name,
  value,
  label,
  description,
  icon,
  isSelected,
  onSelect,
}: DeliveryOptionCardProps) {
  return (
    <label
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-line bg-bg-card px-3 py-[11px] transition-colors hover:border-ink-3",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
        isSelected && "border-ink bg-canvas shadow-[0_0_0_1px_var(--ink)] hover:border-ink",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={isSelected}
        onChange={onSelect}
        className="sr-only"
      />

      <span
        aria-hidden="true"
        className={cn(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-line-2 transition-colors",
          isSelected && "border-ink",
        )}
      >
        {isSelected && <span className="h-[9px] w-[9px] rounded-full bg-accent" />}
      </span>

      <span
        aria-hidden="true"
        className={cn(
          "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-md bg-bg-sunken text-ink-2 [&_svg]:h-[18px] [&_svg]:w-[18px]",
          isSelected && "bg-ink text-white",
        )}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
        <span className="mt-px block text-[11.5px] text-ink-3">{description}</span>
      </span>
    </label>
  );
}
