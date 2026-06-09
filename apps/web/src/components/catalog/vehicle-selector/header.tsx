import { Car, X } from "lucide-react";

interface VehicleSelectorHeaderProps {
  onClose: () => void;
}

export function VehicleSelectorHeader({ onClose }: VehicleSelectorHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-line flex-shrink-0">
      <div className="w-10 h-10 bg-ink rounded-xl flex items-center justify-center flex-shrink-0">
        <Car className="w-5 h-5 text-white" aria-hidden="true" />
      </div>
      <div>
        <h2 className="font-display font-semibold text-ink text-base leading-tight">
          Избери автомобил
        </h2>
        <p className="text-muted text-xs mt-0.5">
          Покажи само части, съвместими с твоя автомобил
        </p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center border border-line rounded-lg overflow-hidden text-sm">
          <button className="px-3 py-1.5 font-medium text-ink bg-bg-sunken">
            Стъпка по стъпка
          </button>
          <button className="px-3 py-1.5 font-medium text-muted hover:text-ink transition-colors border-l border-line">
            VIN
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-bg-sunken transition-colors"
          aria-label="Затвори"
        >
          <X className="w-5 h-5 text-muted" />
        </button>
      </div>
    </div>
  );
}
