"use client";

import { useCallback, useState } from "react";
import type { GeoPoint } from "@/lib/checkout/delivery/office-distance";

export type DeviceLocationStatus = "idle" | "locating" | "denied" | "unavailable";

/** A position up to five minutes old is as good as a new one for sorting offices. */
const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60_000,
};

/**
 * Where the device is, asked for only when `locate` is called. Browsers quietly block
 * a permission prompt that no click led to, so this must never run on mount.
 */
export function useDeviceLocation() {
  const [status, setStatus] = useState<DeviceLocationStatus>("idle");

  const locate = useCallback((onLocated: (point: GeoPoint) => void) => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }

    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setStatus("idle");
        onLocated({ latitude: coords.latitude, longitude: coords.longitude });
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      POSITION_OPTIONS,
    );
  }, []);

  return { status, locate };
}
