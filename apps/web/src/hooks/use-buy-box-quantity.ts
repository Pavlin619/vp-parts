"use client";

import { useCallback, useMemo, useState } from "react";
import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { stockCeiling } from "@/lib/delivery/availability";

export interface BuyBoxQuantity {
  /** The effective, always-deliverable selection (stock- and ceiling-clamped). */
  selectedQuantity: number;
  /** Highest quantity the current stock allows, capped at the absolute ceiling. */
  maxQuantity: number;
  /** Steps the selection by `delta`, kept within `[1, maxQuantity]`. */
  changeQuantity: (delta: number) => void;
}

/**
 * Owns the buy box quantity selection and its stock ceiling. The selection is
 * derived (never stored out of range) so a re-validation that shrinks available
 * stock below the chosen amount silently clamps the shown value down without an
 * effect. When the backend sends no per-warehouse breakdown we can't know the
 * stock, so the ceiling falls back to the absolute UI maximum.
 */
export function useBuyBoxQuantity(
  availabilityByWarehouse: WarehouseAvailabilityDto[],
): BuyBoxQuantity {
  const [quantity, setQuantity] = useState(1);

  const maxQuantity = useMemo(
    () => stockCeiling(availabilityByWarehouse),
    [availabilityByWarehouse],
  );

  const selectedQuantity = Math.min(quantity, maxQuantity);

  const changeQuantity = useCallback(
    (delta: number) => {
      setQuantity((current) => {
        const effective = Math.min(current, maxQuantity);
        return Math.min(maxQuantity, Math.max(1, effective + delta));
      });
    },
    [maxQuantity],
  );

  return { selectedQuantity, maxQuantity, changeQuantity };
}
