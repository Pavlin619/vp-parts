import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VehicleFitBadgeProps {
  fitsVehicle: boolean | null;
  vehicleName?: string;
  /**
   * `badge` — compact inline pill (default).
   * `box` — full-width panel with a two-line message, used in the buy box.
   */
  variant?: "badge" | "box";
  className?: string;
}

/**
 * Contextual fit indicator shown near the part title and in the buy box.
 * Renders nothing when no vehicle is selected (`fitsVehicle === null`) — fit is
 * a value-add, never a gate.
 */
export function VehicleFitBadge({
  fitsVehicle,
  vehicleName,
  variant = "badge",
  className,
}: VehicleFitBadgeProps) {
  if (fitsVehicle === null) {
    return null;
  }

  if (variant === "box") {
    return <VehicleFitBox fitsVehicle={fitsVehicle} vehicleName={vehicleName} className={className} />;
  }

  if (fitsVehicle) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok",
          className,
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {vehicleName
          ? `Подходяща за ${vehicleName}`
          : "Подходяща за вашия автомобил"}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger",
        className,
      )}
    >
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      {vehicleName
        ? `Не е подходяща за ${vehicleName}`
        : "Не е подходяща за вашия автомобил"}
    </span>
  );
}

/**
 * Full-width fit panel for the buy box. Title line states the verdict; the
 * second line (when provided) names the selected vehicle.
 */
function VehicleFitBox({
  fitsVehicle,
  vehicleName,
  className,
}: {
  fitsVehicle: boolean;
  vehicleName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] px-3 py-2.5",
        fitsVehicle ? "bg-ok-soft" : "bg-danger/10",
        className,
      )}
    >
      {fitsVehicle ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
      ) : (
        <XCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
      )}
      <div className="flex flex-col leading-tight">
        <span
          className={cn(
            "text-sm font-semibold",
            fitsVehicle ? "text-ok" : "text-danger",
          )}
        >
          {fitsVehicle ? "Пасва на твоя автомобил" : "Не пасва на този автомобил"}
        </span>
        {vehicleName && <span className="text-xs text-muted">{vehicleName}</span>}
      </div>
    </div>
  );
}
