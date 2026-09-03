"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  formatCount,
  type SearchOrdering,
  type StockScopeCountsDto,
} from "@vp-parts-shop/shared";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import { useVehicleContext } from "@/hooks/use-vehicle-context";
import {
  buildSearchUrl,
  withVehicle,
  type SearchUrlState,
} from "@/lib/catalog/search-url";
import { SearchSortSelect } from "./search-sort-select";
import { SearchStockFilter } from "./search-stock-filter";
import { SearchVatToggle } from "./search-vat-toggle";
import {
  SearchWideSetBadge,
  SearchWideSetNotice,
} from "./search-wide-set-notice";

/**
 * Hidden below `sm`, where the controls it separates wrap onto their own lines
 * and a rule between them would sit at the end of a row dividing nothing.
 */
const CONTROL_DIVIDER = "hidden h-5 w-px shrink-0 bg-line sm:block";

interface SearchResultsHeaderProps {
  state: SearchUrlState;
  /** Matches after the stock narrowing — what the pager beside it measures. */
  total: number;
  /** The order actually applied, which is not always the one asked for. */
  ordering: SearchOrdering;
  /** Whether the whole set was enumerated, and so which orders are on offer. */
  isRankable: boolean;
  /** Absent on a set we could not rank or could not read stock for. */
  stockScopeCounts?: StockScopeCountsDto;
  /** The compact pager, rendered by the caller and only placed here. */
  pager?: ReactNode;
}

/**
 * The control strip above the results: what the list holds on the left, how it
 * is priced and paged on the right.
 *
 * Which left-hand control appears is decided by the response, not by us. A
 * ranked set carries per-origin stock counts and gets the availability filter,
 * whose options double as the count; a set too wide to rank carries none, so it
 * gets the plain match count and the prompt to narrow. Rendering the filter
 * without counts would offer a narrowing the API has already said it cannot
 * honour.
 *
 * "Too wide" is read from `isRankable` and never inferred from the ordering: a
 * visitor is free to *choose* the catalogue order over a set of fifty, and that
 * must not raise the prompt to narrow it.
 */
export function SearchResultsHeader({
  state,
  total,
  ordering,
  isRankable,
  stockScopeCounts,
  pager,
}: SearchResultsHeaderProps) {
  const router = useRouter();
  const [isNoticeVisible, setNoticeVisible] = useState(true);
  const [isVehicleSelectorOpen, setVehicleSelectorOpen] = useState(false);

  const isWideSet = !isRankable;

  // Read at confirm time rather than subscribed to: the selector writes the
  // vehicle to the store and calls back in the same tick, so a value captured
  // during render would still be the previous one.
  function scopeToSelectedVehicle() {
    setVehicleSelectorOpen(false);
    const vehicle = useVehicleContext.getState().selectedVehicle;

    if (vehicle) {
      router.push(buildSearchUrl(withVehicle(state, vehicle.vehicleId)));
    }
  }

  return (
    <>
      {/* Centred while the controls are stacked, because each row is then a
          band of its own width and left-aligning them leaves ragged gutters on
          alternating sides. It only splits left and right once both fit one
          row. */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2.5 lg:justify-between">
        <div className="flex min-w-0 max-w-full items-center gap-3">
          {stockScopeCounts ? (
            <SearchStockFilter state={state} counts={stockScopeCounts} />
          ) : (
            <p className="text-[14px] text-ink-2">
              <span className="font-display text-xl font-semibold tracking-[-0.01em] tabular-nums text-ink">
                {formatCount(total)}
              </span>{" "}
              артикула
            </p>
          )}

          {isWideSet && !isNoticeVisible && (
            <SearchWideSetBadge onShow={() => setNoticeVisible(true)} />
          )}
        </div>

        {/* Its own row below `lg`, not a narrower share of this one: the three
            controls measure 421px together against a 342px column on a phone,
            and left to shrink they would each overflow their box and paint
            over the count beside them. */}
        <div className="flex w-full flex-wrap items-center justify-center gap-x-3.5 gap-y-2.5 lg:w-auto lg:justify-end">
          <SearchSortSelect
            state={state}
            ordering={ordering}
            isRankable={isRankable}
          />
          <span aria-hidden="true" className={CONTROL_DIVIDER} />
          <SearchVatToggle />
          {pager && (
            <>
              <span aria-hidden="true" className={CONTROL_DIVIDER} />
              {pager}
            </>
          )}
        </div>
      </div>

      {isWideSet && isNoticeVisible && (
        <SearchWideSetNotice
          onOpenVehicleSelector={() => setVehicleSelectorOpen(true)}
          onHide={() => setNoticeVisible(false)}
        />
      )}

      <VehicleSelector
        isOpen={isVehicleSelectorOpen}
        onClose={() => setVehicleSelectorOpen(false)}
        onConfirm={scopeToSelectedVehicle}
      />
    </>
  );
}
