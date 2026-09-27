import type { DeliveryOfficeDto, DeliveryOfficeType, ShippingMethod } from "@vp-parts-shop/shared";

/** A GeoJSON position, longitude first. */
type LngLat = [number, number];

export interface OfficeFeatureCollection {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: LngLat };
    properties: {
      code: string;
      carrier: ShippingMethod;
      type: DeliveryOfficeType;
    };
  }[];
}

export function toOfficeFeatures(offices: DeliveryOfficeDto[]): OfficeFeatureCollection {
  return {
    type: "FeatureCollection",
    features: offices.map(({ code, carrier, type, latitude, longitude }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: { code, carrier, type },
    })),
  };
}

/** South-west and north-east corners around every office, or null for none. */
export function officeBounds(offices: DeliveryOfficeDto[]): [LngLat, LngLat] | null {
  if (offices.length === 0) {
    return null;
  }

  const longitudes = offices.map(({ longitude }) => longitude);
  const latitudes = offices.map(({ latitude }) => latitude);

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}
