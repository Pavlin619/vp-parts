"use client";

import { VehicleSelectorContent } from "./content";

interface VehicleSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

// VehicleSelectorContent unmounts when isOpen is false, so its useState lazy
// initializers re-run on each open — no effects or refs needed.
export function VehicleSelector({ isOpen, onClose, onConfirm }: VehicleSelectorProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60">
      <VehicleSelectorContent onClose={onClose} onConfirm={onConfirm} />
    </div>
  );
}
