"use client";

import { useMemo, useState } from "react";
import type { DeliveryOfficeDto, ShippingMethod } from "@vp-parts-shop/shared";
import { CARRIER_NAMES } from "@/lib/checkout/delivery/delivery-methods";
import { officeAvailability, type ParcelCheck } from "@/lib/checkout/delivery/office-availability";
import { EMPTY_OFFICE_SEARCH, filterOffices, suggestOffices } from "@/lib/checkout/delivery/office-search";
import { cn } from "@/lib/utils";
import { OfficeDetail } from "./detail";
import { OfficeList } from "./list";
import { OfficeMap } from "./map";
import { OfficeFilters, OfficeSearch } from "./search";

interface OfficeBrowserProps {
  offices: DeliveryOfficeDto[];
  parcelCheck: ParcelCheck;
  carrier: ShippingMethod;
  /** The office already chosen, whose city the list starts in when the customer comes back to change it. */
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
  const [search, setSearch] = useState(() => initialSearch(offices, chosenCode));
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [isMapOpenOnMobile, setIsMapOpenOnMobile] = useState(false);

  const matchingOffices = useMemo(() => filterOffices(offices, search), [offices, search]);
  const selectableOffices = useMemo(
    () => matchingOffices.filter((office) => officeAvailability(office, parcelCheck).isSelectable),
    [matchingOffices, parcelCheck],
  );
  const suggestions = useMemo(() => suggestOffices(offices, search.query), [offices, search.query]);
  const openOffice = offices.find(({ code }) => code === openCode);
  const carrierName = CARRIER_NAMES[carrier];

  // A new search is a new look at the list, so it closes the open office.
  const changeSearch = (nextSearch: typeof search) => {
    setSearch(nextSearch);
    setOpenCode(null);
  };

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

      <OfficeSearch
        query={search.query}
        onQueryChange={(query) => changeSearch({ ...search, query })}
        suggestions={suggestions}
        onPickCity={(city) => changeSearch({ ...search, query: "", city })}
        onPickOffice={jumpToOffice}
      />

      <OfficeFilters search={search} onSearchChange={changeSearch} />

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
              onOpen={setOpenCode}
              onHover={setHoveredCode}
            />
          </div>
        </div>

        <div className={cn("h-[380px] md:h-auto", !isMapOpenOnMobile && "hidden md:block")}>
          <OfficeMap
            offices={selectableOffices}
            carrier={carrier}
            framingKey={JSON.stringify(search)}
            selectedCode={openCode}
            hoveredCode={hoveredCode}
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

/** Coming back to change the office starts among the offices of its city. */
function initialSearch(offices: DeliveryOfficeDto[], chosenCode: string | null) {
  const chosen = offices.find(({ code }) => code === chosenCode);

  return chosen ? { ...EMPTY_OFFICE_SEARCH, city: chosen.city } : EMPTY_OFFICE_SEARCH;
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
