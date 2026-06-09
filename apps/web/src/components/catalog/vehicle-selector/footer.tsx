import { Check, ArrowRight } from "lucide-react";
import type { VehicleVariantDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

interface VehicleSelectorFooterProps {
  pendingVariant: VehicleVariantDto | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function VehicleSelectorFooter({
  pendingVariant,
  onClose,
  onConfirm,
}: VehicleSelectorFooterProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-line flex-shrink-0">
      <div className="min-h-[1.25rem]">
        {pendingVariant && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-ok">
            <Check className="w-4 h-4" aria-hidden="true" />
            Автомобилът е готов
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-ink border border-line rounded-lg hover:bg-bg-sunken transition-colors"
        >
          Отказ
        </button>
        <button
          onClick={onConfirm}
          disabled={!pendingVariant}
          className={cn(
            "flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors",
            pendingVariant
              ? "bg-accent text-white hover:bg-accent-hover"
              : "bg-bg-sunken text-muted cursor-not-allowed",
          )}
        >
          Потвърди
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
