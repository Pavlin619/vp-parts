import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { LocatorMode } from "./address-form-values";

const OPTIONS: readonly { mode: LocatorMode; label: string }[] = [
  { mode: "street", label: "Улица и номер" },
  { mode: "quarter", label: "Квартал / ж.к." },
];

const ARROW_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

interface LocatorModeSwitchProps {
  mode: LocatorMode;
  onChange: (mode: LocatorMode) => void;
}

/** One way to locate the door at a time: Econt takes a street or a quarter, never both. */
export function LocatorModeSwitch({ mode, onChange }: LocatorModeSwitchProps) {
  const moveWithArrows = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = ARROW_STEPS[event.key];
    if (!step) return;

    event.preventDefault();
    const current = OPTIONS.findIndex((option) => option.mode === mode);
    const next = OPTIONS[(current + step + OPTIONS.length) % OPTIONS.length];
    onChange(next.mode);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [OPTIONS.indexOf(next)]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Как да намерим адреса"
      className="grid grid-cols-2 gap-1 rounded-lg bg-bg-sunken p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={mode === option.mode}
          tabIndex={mode === option.mode ? 0 : -1}
          onClick={() => onChange(option.mode)}
          onKeyDown={moveWithArrows}
          className={cn(
            "h-9 rounded-md text-[12.5px] font-semibold text-ink-3 focus-visible:outline-2 focus-visible:outline-accent",
            mode === option.mode && "bg-bg-card text-ink shadow-sm",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
