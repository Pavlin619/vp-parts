import { useEffect, useRef } from "react";
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
  const stripRef = useRef<HTMLDivElement>(null);

  // Advancing a step is what pushes the strip past a phone's width, and the tab
  // that lands off-screen is the one now active. Inert where it does not scroll.
  useEffect(() => {
    stripRef.current?.children[step]?.scrollIntoView?.({
      inline: "nearest",
      block: "nearest",
    });
  }, [step]);

  return (
    // Scrolls rather than wraps: the labels carry the values picked so far, so
    // three of them run well past a phone's width once two steps are done.
    <div
      ref={stripRef}
      className="thin-scrollbar flex border-b border-line px-4 flex-shrink-0 overflow-x-auto sm:px-6"
    >
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
              "flex flex-shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap sm:px-4",
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
