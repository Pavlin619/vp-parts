import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_LABELS, type Step } from "./use-vehicle-selector";

interface VehicleSelectorStepTabsProps {
  step: Step;
  stepValues: (string | null)[];
  onStepClick: (targetStep: Step) => void;
}

export function VehicleSelectorStepTabs({
  step,
  stepValues,
  onStepClick,
}: VehicleSelectorStepTabsProps) {
  return (
    <div className="flex border-b border-line px-6 flex-shrink-0">
      {STEP_LABELS.map((label, i) => {
        const isCompleted = i < step;
        const isActive = i === step;
        const value = stepValues[i];
        return (
          <button
            key={label}
            onClick={() => onStepClick(i as Step)}
            disabled={i > step}
            className={cn(
              "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              isActive && "border-accent text-ink",
              isCompleted &&
                "border-transparent text-ok cursor-pointer hover:bg-bg-sunken rounded-t-lg",
              !isActive && !isCompleted && "border-transparent text-muted cursor-not-allowed",
            )}
          >
            {isCompleted && (
              <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            )}
            <span>
              {label}
              {value && <span className="font-normal"> · {value}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
