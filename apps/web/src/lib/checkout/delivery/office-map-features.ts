import type { DeliveryOfficeDto, DeliveryOfficeType, ShippingMethod } from "@vp-parts-shop/shared";
import { sortOfficesByDistance, type GeoPoint } from "./office-distance";

/** Enough offices around the customer to choose between, without zooming out to the country. */
const NEAREST_FRAMED_OFFICES = 8;

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

export interface LocationFeatureCollection {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: LngLat };
    properties: Record<string, never>;
  }[];
}

export function toLocationFeatures(point: GeoPoint | null): LocationFeatureCollection {
  return {
    type: "FeatureCollection",
    features: point
      ? [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
            properties: {},
          },
        ]
      : [],
  };
}

/** Around the point and the offices nearest it when there is one; otherwise around every office. */
export function framingBounds(
  offices: DeliveryOfficeDto[],
  around: GeoPoint | null,
): [LngLat, LngLat] | null {
  if (!around) {
    return officeBounds(offices);
  }

  const nearest = sortOfficesByDistance(offices, around).slice(0, NEAREST_FRAMED_OFFICES);

  return officeBounds([around, ...nearest]);
}

/** South-west and north-east corners around every point, or null for none. */
export function officeBounds(points: GeoPoint[]): [LngLat, LngLat] | null {
  if (points.length === 0) {
    return null;
  }

  const longitudes = points.map(({ longitude }) => longitude);
  const latitudes = points.map(({ latitude }) => latitude);

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}
