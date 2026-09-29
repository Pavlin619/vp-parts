"use client";

import { useState } from "react";
import type { DeliveryOfficeDto, DeliveryPlaceDto } from "@vp-parts-shop/shared";
import {
  placeNearestTo,
  placeOfOffice,
  placePoint,
} from "@/lib/checkout/delivery/delivery-places";
import type { GeoPoint, ReferencePoint } from "@/lib/checkout/delivery/office-distance";

/** Farther than this from every office, a guessed location names no town. */
const MAX_GUESS_DISTANCE_METERS = 25_000;

interface PlaceScopeSource {
  offices: DeliveryOfficeDto[];
  places: DeliveryPlaceDto[];
  /** The office already chosen; changing it starts in its place, measured from it. */
  chosenCode: string | null;
  /** Where the request seems to come from; the place starts there when no office is chosen. */
  approximateLocation: GeoPoint | null;
}

interface PlaceScope {
  /** A region the customer picked; one filled in from a place goes with the place. */
  chosenRegion: string | null;
  place: DeliveryPlaceDto | null;
  /** What the offices are sorted and measured from. */
  referencePoint: ReferencePoint | null;
  /** The place was guessed from the request, not chosen; any choice ends that. */
  isApproximate: boolean;
}

const NOTHING_CHOSEN: PlaceScope = {
  chosenRegion: null,
  place: null,
  referencePoint: null,
  isApproximate: false,
};

/** Where the customer is looking for an office: the region, the place, and the point offices are measured from. */
export function usePlaceScope(source: PlaceScopeSource) {
  const { offices, places } = source;
  const [scope, setScope] = useState(() => initialScope(source));

  const choosePlace = (place: DeliveryPlaceDto | null) =>
    setScope((current) => ({
      ...current,
      place,
      referencePoint: place && placeReference(place, offices),
      isApproximate: false,
    }));

  const chooseRegion = (region: string | null) =>
    setScope((current) =>
      current.place === null || current.place.region === region
        ? { ...current, chosenRegion: region, isApproximate: false }
        : { ...NOTHING_CHOSEN, chosenRegion: region },
    );

  const sortNear = (point: GeoPoint) =>
    setScope({
      ...NOTHING_CHOSEN,
      place: placeNearestTo(point, offices, places)?.place ?? null,
      referencePoint: { ...point, kind: "device", label: "вас" },
    });

  const dropReferencePoint = () =>
    setScope((current) => ({
      ...current,
      referencePoint: current.place && placeReference(current.place, offices),
    }));

  const { chosenRegion, place, referencePoint, isApproximate } = scope;

  return {
    region: place?.region ?? chosenRegion,
    place,
    referencePoint,
    isApproximate,
    choosePlace,
    chooseRegion,
    sortNear,
    dropReferencePoint,
  };
}

/** The office chosen before, then the guessed location, then nothing. */
function initialScope({
  offices,
  places,
  chosenCode,
  approximateLocation,
}: PlaceScopeSource): PlaceScope {
  const chosen = offices.find(({ code }) => code === chosenCode);
  if (chosen) {
    const { latitude, longitude, name } = chosen;

    return {
      ...NOTHING_CHOSEN,
      place: placeOfOffice(places, chosen),
      referencePoint: { latitude, longitude, kind: "chosen-office", label: name },
    };
  }

  const guessed = approximateLocation && placeNearestTo(approximateLocation, offices, places);
  if (!guessed || guessed.distanceMeters > MAX_GUESS_DISTANCE_METERS) {
    return NOTHING_CHOSEN;
  }

  return {
    ...NOTHING_CHOSEN,
    place: guessed.place,
    referencePoint: placeReference(guessed.place, offices),
    isApproximate: true,
  };
}

function placeReference(
  place: DeliveryPlaceDto,
  offices: DeliveryOfficeDto[],
): ReferencePoint | null {
  const point = placePoint(place, offices);

  return point && { ...point, kind: "place", label: place.name };
}
