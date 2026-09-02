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

const CONTROL_DIVIDER = "h-5 w-px shrink-0 bg-line";

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 items-center gap-3">
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

        <div className="flex shrink-0 items-center gap-3.5">
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
