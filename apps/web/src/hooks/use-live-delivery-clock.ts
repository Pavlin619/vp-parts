"use client";

import { useMemo } from "react";
import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { useNow } from "./use-now";
import { useDeliveryRefresh } from "./use-delivery-refresh";

/**
 * The shared clock for every time-derived label in the buy box, plus the wiring
 * that keeps the live availability snapshot honest.
 *
 * Before the client mounts (and during SSR) the live clock is null, so it falls
 * back to the snapshot instant — a value identical on the server and the first
 * client render, which keeps delivery dates hydration-safe while still showing
 * them immediately. After mount the live clock takes over so staleness and
 * countdowns stay honest, and availability is refetched when an order cut-off
 * passes or the tab regains focus stale (see {@link useDeliveryRefresh}).
 */
export function useLiveDeliveryClock(
  computedAt: string | null | undefined,
  availabilityByWarehouse: WarehouseAvailabilityDto[],
  onRefresh: () => void,
): Date | null {
  const liveNow = useNow();
  const now = liveNow ?? (computedAt ? new Date(computedAt) : null);

  const cutoffAts = useMemo(
    () => availabilityByWarehouse.map((warehouse) => warehouse.cutoffAt),
    [availabilityByWarehouse],
  );

  useDeliveryRefresh(computedAt, cutoffAts, onRefresh);

  return now;
}
