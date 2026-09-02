"use client";

import { createPortal } from "react-dom";
import { useHydration } from "@/hooks/use-vehicle-context";
import { VehicleSelectorContent } from "./content";

interface VehicleSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

/**
 * The overlay is portalled to `document.body` rather than left where it is
 * opened from. `position: fixed` is relative to the nearest ancestor that
 * creates a stacking context, and the search sidebar is `sticky`, which always
 * creates one — rendered in place there, the modal is trapped behind whatever
 * the results column paints, however high its `z-index`.
 *
 * The portal waits for hydration because the server has no `document`, and one
 * caller (`/vehicles`) opens the selector on first render.
 */
export function VehicleSelector({ isOpen, onClose, onConfirm }: VehicleSelectorProps) {
  const isHydrated = useHydration();

  // VehicleSelectorContent unmounts when isOpen is false, so its useState lazy
  // initializers re-run on each open — no effects or refs needed.
  if (!isOpen || !isHydrated) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60">
      <VehicleSelectorContent onClose={onClose} onConfirm={onConfirm} />
    </div>,
    document.body,
  );
}
