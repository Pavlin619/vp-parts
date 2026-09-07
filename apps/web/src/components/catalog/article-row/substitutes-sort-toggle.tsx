"use client";

import { SearchSort } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

interface SubstitutesSortToggleProps {
  /** The order actually applied — what the control must show as pressed. */
  sort: SearchSort;
  onSortChange: (sort: SearchSort) => void;
}

/**
 * The two axes the API can rank a cross-reference set on that a visitor
 * comparing alternatives asks for. The rest of {@link SearchSort} is deliberately
 * not offered: brand and article-number order answer nothing about a set whose
 * whole point is that the brands differ.
 */
const SORT_OPTIONS: readonly { sort: SearchSort; label: string }[] = [
  { sort: SearchSort.PriceAscending, label: "Цена" },
  { sort: SearchSort.Availability, label: "Наличност" },
];

/**
 * Chooses the order the substitutes are served in — a two-way segmented control
 * rather than the search page's menu, because a set this small has only these
 * two useful answers and both fit on one line.
 *
 * Every option is answerable here: the whole cross-reference set is enumerated
 * and its stock read before it is paged, so there is no wide-set tier to fall
 * back from and no ordering the API can refuse.
 */
export function SubstitutesSortToggle({
  sort,
  onSortChange,
}: SubstitutesSortToggleProps) {
  // Re-asking for the applied order would refetch nothing and reset the pages a
  // visitor has already opened.
  const selectSort = (next: SearchSort) => {
    if (next !== sort) {
      onSortChange(next);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[12.5px] text-ink-3 sm:inline">
        Сортирай
      </span>

      <div
        role="group"
        aria-label="Подредба на заменяемите части"
        className="flex items-center gap-0.5 rounded-lg bg-bg-sunken p-0.5"
      >
        {SORT_OPTIONS.map((option) => {
          const isApplied = option.sort === sort;

          return (
            <button
              key={option.sort}
              type="button"
              aria-pressed={isApplied}
              onClick={() => selectSort(option.sort)}
              className={cn(
                "inline-flex h-7 items-center rounded-md px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isApplied
                  ? "bg-bg-card text-ink shadow-sm"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
