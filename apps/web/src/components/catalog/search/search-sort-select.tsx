"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Check, ChevronDown } from "lucide-react";
import {
  SearchSort,
  requiresRankedSet,
  type SearchOrdering,
} from "@vp-parts-shop/shared";
import { buildSearchUrl, withSort } from "@/lib/catalog/search-url";
import type { SearchUrlState } from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";

interface SearchSortSelectProps {
  state: SearchUrlState;
  /** The order actually applied — what the control must show as selected. */
  ordering: SearchOrdering;
  /** Whether the API enumerated the whole set, and so could rank it at all. */
  isRankable: boolean;
}

interface SortOption {
  sort: SearchSort;
  label: string;
  /**
   * The direction, split out so the label names the axis and this names which
   * way along it. Two price rows reading "Цена (възходящо)" and "Цена
   * (низходящо)" differ by one word in the middle of a parenthesis; these
   * differ by an arrow.
   */
  hint?: string;
}

/** Default first, then the axes a visitor is most likely to reach for. */
const SORT_OPTIONS: readonly SortOption[] = [
  { sort: SearchSort.Availability, label: "Наличност", hint: "в склад първо" },
  { sort: SearchSort.PriceAscending, label: "Цена", hint: "ниска → висока" },
  { sort: SearchSort.PriceDescending, label: "Цена", hint: "висока → ниска" },
  { sort: SearchSort.Brand, label: "Производител", hint: "А-Я" },
  { sort: SearchSort.ArticleNumber, label: "Номер на артикул" },
  { sort: SearchSort.Catalogue, label: "По съвпадение" },
];

/**
 * Chooses the order the results are served in.
 *
 * Which orders are on offer is the response's decision, not ours: the two that
 * rank on what we can ship need the whole match set enumerated, so a set too
 * wide for that is offered the catalogue axes alone. Listing them anyway would
 * offer an order we would quietly not apply.
 *
 * The selected option is the order *applied*, which is not always the one in the
 * URL — a wide set asked for price is served in catalogue order, and the control
 * has to say so. The URL keeps the preference, so narrowing the search back
 * under the limit restores it.
 */
export function SearchSortSelect({
  state,
  ordering,
  isRankable,
}: SearchSortSelectProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const options = SORT_OPTIONS.filter(
    (option) => isRankable || !requiresRankedSet(option.sort),
  );

  // Falls back to the first offered option rather than rendering an empty
  // trigger: an ordering absent from the list means the tiers disagree, which is
  // a bug to survive rather than a blank control to ship.
  const selected =
    options.find((option) => option.sort === ordering) ?? options[0];

  function selectSort(sort: SearchSort) {
    setIsOpen(false);
    router.push(buildSearchUrl(withSort(state, sort)));
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex h-9 items-center gap-2 rounded-full border bg-bg-card px-3.5 text-[13.5px] transition-colors",
          isOpen
            ? "border-ink ring-1 ring-ink"
            : "border-line shadow-card hover:border-line-2",
        )}
      >
        <ArrowDownUp
          className="hidden h-3.5 w-3.5 text-ink-4 sm:block"
          aria-hidden="true"
        />
        <span className="hidden text-ink-3 sm:inline">Подредба</span>
        <span className="whitespace-nowrap font-semibold text-ink">
          {selected.label}
        </span>
        {selected.hint && (
          <span className="hidden text-ink-3 sm:inline">{selected.hint}</span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-ink-4 transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        // Anchored to whichever edge of the trigger has the viewport behind it.
        // From `lg` the strip is right-aligned, so the panel opens leftwards;
        // below that the trigger leads a centred row with the panel's width to
        // its right and barely a chip's worth to its left, and opening leftwards
        // ran the options off the screen.
        <div
          role="listbox"
          aria-label="Подредба"
          className="absolute left-0 top-[calc(100%+8px)] z-[60] w-[264px] max-w-[calc(100vw-2rem)] rounded-md border border-line bg-bg-card p-1.5 shadow-overlay lg:left-auto lg:right-0"
        >
          {options.map((option) => {
            const isSelected = option.sort === selected.sort;

            return (
              <button
                key={option.sort}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => selectSort(option.sort)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2.5 py-2.5 text-left text-[13.5px] transition-colors",
                  isSelected ? "bg-bg-sunken" : "hover:bg-canvas",
                )}
              >
                <span className="font-semibold text-ink">{option.label}</span>
                {option.hint && (
                  <span className="text-ink-3">{option.hint}</span>
                )}
                {isSelected && (
                  <Check
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
