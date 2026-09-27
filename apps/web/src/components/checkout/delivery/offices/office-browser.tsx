"use client";

import { useMemo, useState } from "react";
import type { DeliveryOfficeDto, ShippingMethod } from "@vp-parts-shop/shared";
import { useDeviceLocation } from "@/hooks/use-device-location";
import { CARRIER_NAMES } from "@/lib/checkout/delivery/delivery-methods";
import { officeAvailability, type ParcelCheck } from "@/lib/checkout/delivery/office-availability";
import {
  sortOfficesByDistance,
  type ReferencePoint,
} from "@/lib/checkout/delivery/office-distance";
import {
  EMPTY_OFFICE_SEARCH,
  filterOffices,
  suggestOffices,
  type OfficeSearch as OfficeSearchState,
} from "@/lib/checkout/delivery/office-search";
import { cn } from "@/lib/utils";
import { OfficeDetail } from "./detail";
import { OfficeList } from "./list";
import { OfficeMap } from "./map";
import { DeviceLocationNotice, NearMeButton, OfficeFilters, OfficeSearch } from "./search";

interface OfficeBrowserProps {
  offices: DeliveryOfficeDto[];
  parcelCheck: ParcelCheck;
  carrier: ShippingMethod;
  /** The office already chosen, which the list starts nearest to when the customer comes back to change it. */
  chosenCode: string | null;
  onChoose: (officeCode: string) => void;
  /** Present while an office is already chosen, to keep it. */
  onCancel?: () => void;
}

/** The searchable office list beside a map; opening an office in either shows it in full. */
export function OfficeBrowser({
  offices,
  parcelCheck,
  carrier,
  chosenCode,
  onChoose,
  onCancel,
}: OfficeBrowserProps) {
  const [search, setSearch] = useState(EMPTY_OFFICE_SEARCH);
  const [referencePoint, setReferencePoint] = useState(() =>
    chosenOfficePoint(offices, chosenCode),
  );
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [isMapOpenOnMobile, setIsMapOpenOnMobile] = useState(false);
  const deviceLocation = useDeviceLocation();

  const sortedOffices = useMemo(
    () => (referencePoint ? sortOfficesByDistance(offices, referencePoint) : offices),
    [offices, referencePoint],
  );
  const matchingOffices = useMemo(
    () => filterOffices(sortedOffices, search),
    [sortedOffices, search],
  );
  const selectableOffices = useMemo(
    () => matchingOffices.filter((office) => officeAvailability(office, parcelCheck).isSelectable),
    [matchingOffices, parcelCheck],
  );
  const suggestions = useMemo(
    () => suggestOffices(sortedOffices, search.query),
    [sortedOffices, search.query],
  );
  const openOffice = offices.find(({ code }) => code === openCode);
  const carrierName = CARRIER_NAMES[carrier];
  const mapReferencePoint = isSearchingPlace(search) ? null : referencePoint;

  // A new search is a new look at the list, so it closes the open office.
  const changeSearch = (nextSearch: OfficeSearchState) => {
    setSearch(nextSearch);
    setOpenCode(null);
  };

  const changeReferencePoint = (nextPoint: ReferencePoint | null) => {
    setReferencePoint(nextPoint);
    setOpenCode(null);
  };

  // "Near me" asks about every city, so it drops the place searched for but keeps the kind.
  const sortNearDevice = () =>
    deviceLocation.locate((point) => {
      setSearch((current) => ({ ...EMPTY_OFFICE_SEARCH, type: current.type }));
      changeReferencePoint({ ...point, kind: "device", label: "вас" });
    });

  const jumpToOffice = (office: DeliveryOfficeDto) => {
    setSearch({ ...EMPTY_OFFICE_SEARCH, city: office.city });
    setOpenCode(office.code);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] text-ink-3">
        Офиси на <b className="font-semibold text-ink">{carrierName}</b>
        {search.city && (
          <>
            {" "}
            в <b className="font-semibold text-ink">{search.city}</b>
          </>
        )}
      </p>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <OfficeSearch
            query={search.query}
            onQueryChange={(query) => changeSearch({ ...search, query })}
            suggestions={suggestions}
            onPickCity={(city) => changeSearch({ ...search, query: "", city })}
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
        onClearReferencePoint={() => changeReferencePoint(null)}
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
          <ResultsHead count={matchingOffices.length} onCancel={onCancel} />
          <div className="max-h-[380px] overflow-y-auto pr-0.5 md:max-h-none md:flex-1">
            <OfficeList
              offices={matchingOffices}
              parcelCheck={parcelCheck}
              hoveredCode={hoveredCode}
              referencePoint={referencePoint}
              onOpen={setOpenCode}
              onHover={setHoveredCode}
            />
          </div>
        </div>

        <div className={cn("h-[380px] md:h-auto", !isMapOpenOnMobile && "hidden md:block")}>
          <OfficeMap
            offices={selectableOffices}
            carrier={carrier}
            framingKey={JSON.stringify({ search, mapReferencePoint })}
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

/** Coming back to change the office starts nearest to it, with every office still in reach. */
function chosenOfficePoint(
  offices: DeliveryOfficeDto[],
  chosenCode: string | null,
): ReferencePoint | null {
  const chosen = offices.find(({ code }) => code === chosenCode);
  if (!chosen) {
    return null;
  }

  const { latitude, longitude, name } = chosen;

  return { latitude, longitude, kind: "chosen-office", label: name };
}

/** A searched place frames the map on itself; framing around the point would pull it out to the country. */
function isSearchingPlace({ query, city }: OfficeSearchState): boolean {
  return city !== null || query.trim() !== "";
}

function ResultsHead({ count, onCancel }: { count: number; onCancel?: () => void }) {
  return (
    <div className="flex items-center justify-between px-0.5 pb-2 text-[11.5px] text-ink-4">
      <span>
        {count} {count === 1 ? "резултат" : "резултата"}
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
