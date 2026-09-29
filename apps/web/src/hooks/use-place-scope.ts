"use client";

import { useState } from "react";
import type { DeliveryOfficeDto, DeliveryPlaceDto } from "@vp-parts-shop/shared";
import { placeOfOffice, placePoint } from "@/lib/checkout/delivery/delivery-places";
import {
  sortOfficesByDistance,
  type GeoPoint,
  type ReferencePoint,
} from "@/lib/checkout/delivery/office-distance";

interface PlaceScopeSource {
  offices: DeliveryOfficeDto[];
  places: DeliveryPlaceDto[];
  /** The office already chosen; changing it starts in its place, measured from it. */
  chosenCode: string | null;
}

interface PlaceScope {
  /** A region the customer picked; one filled in from a place goes with the place. */
  chosenRegion: string | null;
  place: DeliveryPlaceDto | null;
  /** What the offices are sorted and measured from. */
  referencePoint: ReferencePoint | null;
}

/** Where the customer is looking for an office: the region, the place, and the point offices are measured from. */
export function usePlaceScope({ offices, places, chosenCode }: PlaceScopeSource) {
  const [scope, setScope] = useState(() => initialScope({ offices, places, chosenCode }));

  const choosePlace = (place: DeliveryPlaceDto | null) =>
    setScope((current) => ({
      ...current,
      place,
      referencePoint: place && placeReference(place, offices),
    }));

  const chooseRegion = (region: string | null) =>
    setScope((current) =>
      current.place === null || current.place.region === region
        ? { ...current, chosenRegion: region }
        : { chosenRegion: region, place: null, referencePoint: null },
    );

  const sortNear = (point: GeoPoint) => {
    const [nearest] = sortOfficesByDistance(offices, point);
    const place = nearest ? placeOfOffice(places, nearest) : null;

    setScope({
      chosenRegion: null,
      place,
      referencePoint: { ...point, kind: "device", label: "вас" },
    });
  };

  const dropReferencePoint = () =>
    setScope((current) => ({
      ...current,
      referencePoint: current.place && placeReference(current.place, offices),
    }));

  const { chosenRegion, place, referencePoint } = scope;

  return {
    region: place?.region ?? chosenRegion,
    place,
    referencePoint,
    choosePlace,
    chooseRegion,
    sortNear,
    dropReferencePoint,
  };
}

function initialScope({ offices, places, chosenCode }: PlaceScopeSource): PlaceScope {
  const chosen = offices.find(({ code }) => code === chosenCode);
  if (!chosen) {
    return { chosenRegion: null, place: null, referencePoint: null };
  }

  const place = placeOfOffice(places, chosen);
  const { latitude, longitude, name } = chosen;

  return {
    chosenRegion: null,
    place,
    referencePoint: { latitude, longitude, kind: "chosen-office", label: name },
  };
}

function placeReference(
  place: DeliveryPlaceDto,
  offices: DeliveryOfficeDto[],
): ReferencePoint | null {
  const point = placePoint(place, offices);

  return point && { ...point, kind: "place", label: place.name };
}
