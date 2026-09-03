"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { formatCount } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

interface SearchFiltersPanelProps {
  /** Matches waiting behind the panel — what its footer offers to go back to. */
  total: number;
  /** Narrowings currently applied, for the trigger's badge. */
  activeCount: number;
  /** The sidebar blocks, rendered on the server and only placed by this. */
  children: ReactNode;
}

/**
 * Where the filters live below `lg`: behind a trigger, in a sheet over the page.
 *
 * The sidebar is a column of uncapped lists — the category block alone runs to
 * 56 rows — so stacked above the results it measured 2,268px on a broad query,
 * putting the first part three and a half screens down. That is the whole
 * reason this exists; it is not a tidier way to show the same thing.
 *
 * Which of the two layouts applies is decided in CSS, not JavaScript. The
 * alternative is a media-query hook, and it would have to render *something*
 * before it knows the width — either the sheet or the sidebar, wrong half the
 * time, corrected on hydration in front of the visitor.
 *
 * `display: contents` on the wrapper is what lets one element do both: the
 * trigger and the sheet become grid items of the search layout directly, so at
 * `lg` the sheet is the sidebar in column one and the `lg:hidden` trigger is
 * out of the grid entirely rather than taking a row of its own.
 */
export function SearchFiltersPanel({
  total,
  activeCount,
  children,
}: SearchFiltersPanelProps) {
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    // The sheet scrolls; the results behind it must not, or a flick past the
    // end of the filters carries the page away underneath them.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={isOpen}
        aria-label={activeCount > 0 ? `Филтри (${activeCount} приложени)` : undefined}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-bg-card text-[14px] font-semibold text-ink shadow-card transition-colors hover:border-ink-3 lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4 text-ink-3" aria-hidden="true" />
        Филтри
        {activeCount > 0 && (
          <span
            aria-hidden="true"
            className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 font-display text-[11.5px] font-semibold tabular-nums text-white"
          >
            {activeCount}
          </span>
        )}
      </button>

      {/* `lg:contents` on both wrappers hands the grid item back to the
          `<aside>` itself at desktop width. It has to be the grid item: its
          `sticky` travels the height of the grid *area*, which a wrapper sized
          to its own content would not give it. */}
      <div
        className={cn(
          "lg:contents",
          isOpen ? "fixed inset-0 z-50 flex flex-col bg-canvas" : "hidden",
        )}
      >
        <div className="flex items-center justify-between border-b border-line bg-bg-card px-4 py-3 lg:hidden">
          <h2 className="font-display text-[15px] font-semibold text-ink">
            Филтри
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Затвори филтрите"
            className="-mr-1.5 grid h-9 w-9 place-items-center rounded-md text-ink-2 transition-colors hover:bg-bg-sunken hover:text-ink"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4 lg:contents">
          {children}
        </div>

        <div className="border-t border-line bg-bg-card p-4 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-11 w-full rounded-md bg-ink text-[14px] font-semibold text-white transition-colors hover:bg-accent"
          >
            Покажи {formatCount(total)}{" "}
            {total === 1 ? "резултат" : "резултата"}
          </button>
        </div>
      </div>
    </div>
  );
}
