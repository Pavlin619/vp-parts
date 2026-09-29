"use client";

import { useMemo, useState } from "react";
import type { DeliveryOfficeDto, DeliveryPlaceDto, ShippingMethod } from "@vp-parts-shop/shared";
import { useDeviceLocation } from "@/hooks/use-device-location";
import { usePlaceScope } from "@/hooks/use-place-scope";
import { nearbyOffices, placeOfOffice } from "@/lib/checkout/delivery/delivery-places";
import { CARRIER_NAMES } from "@/lib/checkout/delivery/delivery-methods";
import { officeAvailability, type ParcelCheck } from "@/lib/checkout/delivery/office-availability";
import { sortOfficesByDistance } from "@/lib/checkout/delivery/office-distance";
import {
  EMPTY_OFFICE_SEARCH,
  filterOffices,
  suggestOffices,
  type OfficeSearch as OfficeSearchState,
} from "@/lib/checkout/delivery/office-search";
import { cn } from "@/lib/utils";
import { OfficeDetail } from "./detail";
import { OfficeList, PickPlacePrompt } from "./list";
import { OfficeMap } from "./map";
import { PlaceFields } from "./place";
import { DeviceLocationNotice, NearMeButton, OfficeFilters, OfficeSearch } from "./search";

interface OfficeBrowserProps {
  offices: DeliveryOfficeDto[];
  places: DeliveryPlaceDto[];
  parcelCheck: ParcelCheck;
  carrier: ShippingMethod;
  /** The office already chosen, whose place the browser starts in when the customer comes back to change it. */
  chosenCode: string | null;
  onChoose: (officeCode: string) => void;
  /** Present while an office is already chosen, to keep it. */
  onCancel?: () => void;
}

/** Where the customer finds an office: a place first, then its offices in a list beside a map. */
export function OfficeBrowser({
  offices,
  places,
  parcelCheck,
  carrier,
  chosenCode,
  onChoose,
  onCancel,
}: OfficeBrowserProps) {
  const scope = usePlaceScope({ offices, places, chosenCode });
  const { place, referencePoint } = scope;
  const [search, setSearch] = useState(EMPTY_OFFICE_SEARCH);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [isMapOpenOnMobile, setIsMapOpenOnMobile] = useState(false);
  const deviceLocation = useDeviceLocation();

  const scopedOffices = useMemo(
    () =>
      place || referencePoint
        ? nearbyOffices(offices, { place, reference: referencePoint })
        : offices,
    [offices, place, referencePoint],
  );
  const matchingOffices = useMemo(
    () => filterOffices(scopedOffices, search),
    [scopedOffices, search],
  );
  const selectableOffices = useMemo(
    () => matchingOffices.filter((office) => officeAvailability(office, parcelCheck).isSelectable),
    [matchingOffices, parcelCheck],
  );
  const suggestions = useMemo(
    () =>
      suggestOffices(
        referencePoint ? sortOfficesByDistance(offices, referencePoint) : offices,
        search.query,
      ),
    [offices, referencePoint, search.query],
  );

  const openOffice = offices.find(({ code }) => code === openCode);
  const carrierName = CARRIER_NAMES[carrier];
  const isSearching = search.query.trim() !== "";
  const isAwaitingPlace = !place && !referencePoint && !isSearching;
  const mapReferencePoint = isSearching ? null : referencePoint;
  const servedPlace = place?.servingOfficeCode
    ? { officeCode: place.servingOfficeCode, name: place.name }
    : null;

  // Any new look at the list closes the open office.
  const closingOffice =
    <Args extends unknown[]>(change: (...args: Args) => void) =>
    (...args: Args) => {
      change(...args);
      setOpenCode(null);
    };

  const changeSearch = closingOffice((nextSearch: OfficeSearchState) => setSearch(nextSearch));
  const changeRegion = closingOffice(scope.chooseRegion);
  const dropReferencePoint = closingOffice(scope.dropReferencePoint);

  const changePlace = closingOffice((nextPlace: DeliveryPlaceDto | null) => {
    scope.choosePlace(nextPlace);
    setSearch((current) => ({ ...current, query: "" }));
  });

  const sortNearDevice = () =>
    deviceLocation.locate(
      closingOffice((point) => {
        scope.sortNear(point);
        setSearch((current) => ({ ...EMPTY_OFFICE_SEARCH, type: current.type }));
      }),
    );

  const jumpToOffice = (office: DeliveryOfficeDto) => {
    changePlace(placeOfOffice(places, office));
    setOpenCode(office.code);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] text-ink-3">
        Офиси на <b className="font-semibold text-ink">{carrierName}</b>
        {place && (
          <>
            {" "}
            в <b className="font-semibold text-ink">{place.name}</b>
          </>
        )}
      </p>

      <PlaceFields
        places={places}
        region={scope.region}
        place={place}
        onRegionChange={changeRegion}
        onPlaceChange={changePlace}
      />

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <OfficeSearch
            query={search.query}
            onQueryChange={(query) => changeSearch({ ...search, query })}
            suggestions={suggestions}
            onPickOffice={jumpToOffice}
          />
        </div>
        <NearMeButton
          isLocating={deviceLocation.status === "locating"}
          onClick={sortNearDevice}
        />
      </div>

      <DeviceLocationNotice status={deviceLocation.status} />

      <OfficeFilters
        search={search}
        onSearchChange={changeSearch}
        referencePoint={referencePoint}
        onClearReferencePoint={dropReferencePoint}
      />

      <button
        type="button"
        onClick={() => setIsMapOpenOnMobile((isOpen) => !isOpen)}
        className="self-start text-[12px] font-medium text-ink-2 underline underline-offset-2 md:hidden"
      >
        {isMapOpenOnMobile ? "Скрий картата" : "Покажи на картата"}
      </button>

      <div className="grid gap-3 md:h-[520px] md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {openOffice && (
          <div className="min-h-0 overflow-y-auto">
            <OfficeDetail
              office={openOffice}
              availability={officeAvailability(openOffice, parcelCheck)}
              onBack={() => setOpenCode(null)}
              onChoose={onChoose}
            />
          </div>
        )}

        {/* Hidden, not unmounted, so Back returns to the list where it was scrolled. */}
        <div hidden={Boolean(openOffice)} className="flex min-h-0 flex-col">
          <ResultsHead
            count={isAwaitingPlace ? null : matchingOffices.length}
            onCancel={onCancel}
          />
          <div className="max-h-[380px] overflow-y-auto pr-0.5 md:max-h-none md:flex-1">
            {isAwaitingPlace ? (
              <PickPlacePrompt />
            ) : (
              <OfficeList
                offices={matchingOffices}
                parcelCheck={parcelCheck}
                hoveredCode={hoveredCode}
                referencePoint={referencePoint}
                servedPlace={servedPlace}
                onOpen={setOpenCode}
                onHover={setHoveredCode}
              />
            )}
          </div>
        </div>

        <div className={cn("h-[380px] md:h-auto", !isMapOpenOnMobile && "hidden md:block")}>
          <OfficeMap
            offices={selectableOffices}
            carrier={carrier}
            framingKey={JSON.stringify({ search, placeId: place?.id, mapReferencePoint })}
            selectedCode={openCode}
            hoveredCode={hoveredCode}
            referencePoint={mapReferencePoint}
            onSelect={setOpenCode}
            onHover={setHoveredCode}
          />
        </div>
      </div>

      <p className="px-0.5 pt-1 text-[10.5px] text-ink-4">
        Данните за офисите се предоставят от {carrierName}
      </p>
    </div>
  );
}

/** Counts nothing while the list waits for a place. */
function ResultsHead({ count, onCancel }: { count: number | null; onCancel?: () => void }) {
  return (
    <div className="flex min-h-[26px] items-center justify-between px-0.5 pb-2 text-[11.5px] text-ink-4">
      <span>
        {count !== null && (
          <>
            {count} {count === 1 ? "резултат" : "резултата"}
          </>
        )}
      </span>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-[11.5px] font-semibold text-accent-hover hover:underline"
        >
          Отказ
        </button>
      )}
    </div>
  );
}
