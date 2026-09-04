"use client";

import { usePriceDisplay, usePricesIncludeVat } from "@/hooks/use-price-display";
import { cn } from "@/lib/utils";

/**
 * Switches every price in the list between gross and net.
 *
 * It sits with the results rather than in the sidebar because it does not
 * narrow anything — it restates the same rows, and a trade customer pricing a
 * job wants it in reach of the figures it changes.
 */
export function SearchVatToggle() {
  const includesVat = usePricesIncludeVat();
  const setIncludesVat = usePriceDisplay((state) => state.setIncludesVat);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        id="search-vat-toggle-label"
        className="whitespace-nowrap text-[13.5px] font-medium text-ink-2"
      >
        <span className="hidden sm:inline">Цени </span>с ДДС
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={includesVat}
        aria-labelledby="search-vat-toggle-label"
        onClick={() => setIncludesVat(!includesVat)}
        className={cn(
          "relative h-[21px] w-[38px] shrink-0 rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
          includesVat ? "bg-accent" : "bg-line-2",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 h-[17px] w-[17px] rounded-full bg-white shadow-sm transition-[left]",
            includesVat ? "left-[19px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
