"use client";

import { Tooltip } from "@/components/common/tooltip";
import { cn } from "@/lib/utils";

interface SearchExactToggleProps {
  isExact: boolean;
  onChange: (isExact: boolean) => void;
}

const DESCRIPTION =
  "Връща само артикули, които съвпадат буква по буква — без частични " +
  "съвпадения и без подобни номера.";

/**
 * Narrows a part-number search to a literal match. Rendered only in the number
 * scope: "exact" qualifies how a number is matched and means nothing for a
 * free-text query, so offering it there would promise narrowing the API cannot
 * perform.
 */
export function SearchExactToggle({
  isExact,
  onChange,
}: SearchExactToggleProps) {
  return (
    <Tooltip
      side="bottom"
      label={`Точно съвпадение — ${isExact ? "вкл." : "изкл."}`}
      description={DESCRIPTION}
    >
      <button
        type="button"
        role="switch"
        aria-checked={isExact}
        aria-label="Точно съвпадение"
        // The shortcut is declared rather than printed: the panel is the one
        // place with room to explain the control, and a key chip there earns
        // its space only for a control a visitor reaches often.
        aria-keyshortcuts="Alt+E"
        onClick={() => onChange(!isExact)}
        className={cn(
          "flex h-[30px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors",
          isExact
            ? "border-ink bg-ink"
            : "border-line-2 hover:border-ink-3",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative h-[13px] w-[22px] rounded-[7px] transition-colors",
            isExact ? "bg-brand" : "bg-line-2",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-[9px] w-[9px] rounded-full bg-white shadow-sm transition-[left]",
              isExact ? "left-[11px]" : "left-0.5",
            )}
          />
        </span>
      </button>
    </Tooltip>
  );
}
