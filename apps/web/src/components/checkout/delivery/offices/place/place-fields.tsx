import { useMemo } from "react";
import type { DeliveryPlaceDto } from "@vp-parts-shop/shared";
import { regionsOf } from "@/lib/checkout/delivery/delivery-places";
import { RegionSelect } from "./region-select";
import { SettlementSearch } from "./settlement-search";

interface PlaceFieldsProps {
  places: DeliveryPlaceDto[];
  region: string | null;
  place: DeliveryPlaceDto | null;
  onRegionChange: (region: string | null) => void;
  onPlaceChange: (place: DeliveryPlaceDto | null) => void;
}

/** Where the customer wants to collect the parcel: a region, then a town or village in it. */
export function PlaceFields({
  places,
  region,
  place,
  onRegionChange,
  onPlaceChange,
}: PlaceFieldsProps) {
  const regions = useMemo(() => regionsOf(places), [places]);

  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
      <RegionSelect regions={regions} region={region} onChange={onRegionChange} />
      <SettlementSearch
        places={places}
        region={region}
        place={place}
        onPick={onPlaceChange}
        onClear={() => onPlaceChange(null)}
      />
    </div>
  );
}
