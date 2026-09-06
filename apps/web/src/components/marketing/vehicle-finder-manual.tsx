"use client";

import { Check, ChevronDown } from "lucide-react";
import type { SelectedVehicle } from "@/hooks/use-vehicle-context";
import { cn } from "@/lib/utils";

interface VehicleFinderManualProps {
  vehicle: SelectedVehicle | null;
  onOpenSelector: () => void;
}

interface Step {
  label: string;
  placeholder: string;
  valueOf: (vehicle: SelectedVehicle) => string;
}

/** The three steps, in the order the dialog asks them. */
const STEPS: Step[] = [
  {
    label: "Марка",
    placeholder: "Избери марка",
    valueOf: (vehicle) => vehicle.manufacturerName,
  },
  { label: "Модел", placeholder: "Модел", valueOf: (vehicle) => vehicle.seriesName },
  { label: "Двигател", placeholder: "Двигател", valueOf: (vehicle) => vehicle.variantName },
];

type StepState = "done" | "next" | "waiting";

/**
 * Which chip reads as the thing to do next.
 *
 * There is no partial state to walk: the store holds a whole vehicle or none of
 * one, because all three names arrive from a single pass through the dialog. So
 * either every step is answered, or the first one is where the visitor starts.
 */
function stepStateOf(vehicle: SelectedVehicle | null, index: number): StepState {
  if (vehicle) return "done";

  return index === 0 ? "next" : "waiting";
}

export function VehicleFinderManual({ vehicle, onOpenSelector }: VehicleFinderManualProps) {
  const [make, ...rest] = STEPS;

  return (
    <div className="space-y-3">
      <StepField step={make} index={0} vehicle={vehicle} onOpen={onOpenSelector} />

      {/* Two to a row: a model name and an engine name are each short enough,
          and stacking all three pushes the call to action below the fold. */}
      <div className="grid grid-cols-2 gap-3">
        {rest.map((step, index) => (
          <StepField
            key={step.label}
            step={step}
            index={index + 1}
            vehicle={vehicle}
            onOpen={onOpenSelector}
          />
        ))}
      </div>
    </div>
  );
}

function StepField({
  step,
  index,
  vehicle,
  onOpen,
}: {
  step: Step;
  index: number;
  vehicle: SelectedVehicle | null;
  onOpen: () => void;
}) {
  const state = stepStateOf(vehicle, index);
  const value = vehicle ? step.valueOf(vehicle) : null;
  const isWaiting = state === "waiting";

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5",
          isWaiting ? "text-ink-4" : "text-muted",
        )}
      >
        <StepChip index={index} state={state} />
        {step.label}
      </div>

      <button
        onClick={onOpen}
        // Named for what it opens rather than what it shows: read on its own,
        // "AUDI" does not say it is the make, and "Модел" repeats the label
        // above it.
        aria-label={value ? `${step.label}: ${value}` : `Избери ${step.label.toLowerCase()}`}
        className={cn(
          "flex h-12 w-full items-center justify-between gap-2 rounded-lg border px-4",
          "text-left transition-colors",
          // A well tinted against the white card, so the field reads as
          // somewhere to answer. A step not reached yet is flattened almost into
          // the card — but it still lights up on hover, because every field
          // opens the same dialog and none of them is a dead control.
          isWaiting
            ? "border-line/60 bg-bg-card hover:border-line"
            : "border-line bg-canvas hover:border-ink-3",
        )}
      >
        <span
          className={cn(
            "truncate text-sm font-medium",
            value ? "text-ink" : isWaiting ? "text-ink-4" : "text-muted",
          )}
        >
          {value ?? step.placeholder}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 flex-shrink-0", isWaiting ? "text-ink-4" : "text-muted")}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/**
 * The step's state as a numbered chip: dark for the one to start on, a green
 * tick for one already answered, grey for one not reached yet.
 *
 * Filled in all three states, where the dialog's step tabs tint the waiting one
 * instead — those sit on the beige strip, which a faint circle reads against,
 * and this card is white, where the same treatment leaves the numeral floating
 * with no chip around it. Hidden from screen readers because the field it labels
 * already names its step.
 */
function StepChip({ index, state }: { index: number; state: StepState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
        "text-[9px] font-semibold leading-none text-white",
        state === "done" && "bg-ok",
        state === "next" && "bg-ink",
        state === "waiting" && "bg-line-2",
      )}
    >
      {state === "done" ? (
        // Heavier than the default stroke: at 10px the tick is a hairline that
        // reads as a smudge on the green.
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      ) : (
        index + 1
      )}
    </span>
  );
}
