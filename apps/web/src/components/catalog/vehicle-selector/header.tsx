import { Car, X } from "lucide-react";

interface VehicleSelectorHeaderProps {
  onClose: () => void;
}

export function VehicleSelectorHeader({ onClose }: VehicleSelectorHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line flex-shrink-0 sm:px-6 sm:py-4">
      <div className="w-10 h-10 bg-ink rounded-xl flex items-center justify-center flex-shrink-0">
        <Car className="w-5 h-5 text-white" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h2 className="font-display font-semibold text-ink text-base leading-tight">
          Избери автомобил
        </h2>
        <p className="text-muted text-xs mt-0.5">
          Покажи само части, съвместими с твоя автомобил
        </p>
      </div>
      {/* Stepping through make, model and engine is the only way in: VIN and
          plate lookup both need a licence we do not hold, so the tab that
          offered them could never answer. */}
      <button
        onClick={onClose}
        className="ml-auto p-1.5 rounded-lg hover:bg-bg-sunken transition-colors flex-shrink-0"
        aria-label="Затвори"
      >
        <X className="w-5 h-5 text-muted" />
      </button>
    </div>
  );
}
