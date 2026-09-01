import Link from "next/link";
import { formatCount } from "@vp-parts-shop/shared";
import type { StockScope, StockScopeCountsDto } from "@vp-parts-shop/shared";
import { buildSearchUrl, withStockScope } from "@/lib/catalog/search-url";
import type { SearchUrlState } from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";

interface SearchStockFilterProps {
  state: SearchUrlState;
  counts: StockScopeCountsDto;
}

interface StockOption {
  /** `undefined` is the unnarrowed list, which is why this is not a StockScope. */
  scope: StockScope | undefined;
  label: string;
  count: number;
  /** The delivery-speed dot the matching rows carry, or none for "all". */
  dotClassName?: string;
}

/**
 * Narrows the results to one stock origin, and says how much each holds.
 *
 * The counts overlap: a part on our shelf that a supplier also stocks is in
 * both, so these are three filters rather than three segments of a whole and
 * they are not expected to add up. The dots repeat the colours the rows below
 * use for the same origins, which is what lets the control be read without a
 * legend.
 */
export function SearchStockFilter({ state, counts }: SearchStockFilterProps) {
  const options: StockOption[] = [
    { scope: undefined, label: "Всички", count: counts.all },
    {
      scope: "central",
      label: "В склад",
      count: counts.central,
      dotClassName: "bg-ok",
    },
    {
      scope: "external",
      label: "В пункт",
      count: counts.external,
      dotClassName: "bg-delivery-day2",
    },
  ];

  return (
    <nav
      aria-label="Наличност"
      className="flex min-w-0 items-center gap-0.5 rounded-full bg-bg-sunken p-1"
    >
      {options.map((option) => (
        <StockOptionLink
          key={option.scope ?? "all"}
          state={state}
          option={option}
          isSelected={state.stockScope === option.scope}
        />
      ))}
    </nav>
  );
}

/**
 * An origin holding nothing is rendered inert rather than dropped: the control
 * has to keep its shape as stock moves under it, or a click lands on whichever
 * option slid into place.
 */
function StockOptionLink({
  state,
  option,
  isSelected,
}: {
  state: SearchUrlState;
  option: StockOption;
  isSelected: boolean;
}) {
  const content = (
    <>
      {option.dotClassName && (
        <span
          aria-hidden="true"
          className={cn("h-[7px] w-[7px] rounded-full", option.dotClassName)}
        />
      )}
      {option.label}
      <span className="font-display text-[14px] tabular-nums text-ink-3">
        {formatCount(option.count)}
      </span>
    </>
  );

  const shape =
    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors";

  if (option.count === 0 && !isSelected) {
    return (
      <span
        aria-disabled="true"
        className={cn(shape, "text-ink-4 opacity-50")}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={buildSearchUrl(withStockScope(state, option.scope))}
      prefetch={false}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        shape,
        isSelected
          ? "bg-bg-card text-ink shadow-sm"
          : "text-ink-2 hover:text-ink",
      )}
    >
      {content}
    </Link>
  );
}
