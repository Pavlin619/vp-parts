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
      className="thin-scrollbar flex border-b border-line bg-canvas px-4 flex-shrink-0 overflow-x-auto sm:px-6"
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
              "flex flex-shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap sm:px-4",
              isActive && "border-accent text-ink font-semibold",
              isCompleted &&
                "border-transparent text-ok cursor-pointer hover:bg-bg-sunken rounded-t-lg",
              !isActive && !isCompleted && "border-transparent text-ink-4 cursor-not-allowed",
            )}
          >
            <StepNumber index={i} isActive={isActive} isCompleted={isCompleted} />
            <span>
              {label}
              {value && <span className="font-normal text-muted"> · {value}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * How far along the visitor is, as a numbered token: filled dark for the step
 * they are on, green with a tick for the ones behind it, faint for the ones
 * ahead. Out of the accessibility tree because it says nothing the tab's own
 * label does not — read out, "1 Марка · AUDI" is noise.
 */
function StepNumber({
  index,
  isActive,
  isCompleted,
}: {
  index: number;
  isActive: boolean;
  isCompleted: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full",
        "text-[11px] font-semibold leading-none",
        isCompleted && "bg-ok text-white",
        isActive && "bg-ink text-white",
        !isActive && !isCompleted && "bg-bg-sunken text-ink-4",
      )}
    >
      {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
    </span>
  );
}
