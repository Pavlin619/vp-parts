"use client";

import { useEffect, useRef, useState } from "react";
import { AlignLeft, Check, ChevronDown, Hash } from "lucide-react";
import type { SearchScope } from "@/hooks/use-search-mode";
import { cn } from "@/lib/utils";

interface ScopeOption {
  scope: SearchScope;
  label: string;
  title: string;
  description: string;
}

/** Default scope first: it also backs the fallback when `scope` is unknown. */
export const SCOPE_OPTIONS: ScopeOption[] = [
  {
    scope: "part",
    label: "Номер",
    title: "Номер на част",
    description: "OEM, каталожен или вътрешен код",
  },
  {
    scope: "generic",
    label: "Описание",
    title: "Общо търсене",
    description: "Наименование, категория, марка, автомобил",
  },
];

const SCOPE_ICON = { generic: AlignLeft, part: Hash } as const;

interface SearchScopeSelectProps {
  scope: SearchScope;
  onChange: (scope: SearchScope) => void;
}

/**
 * Picks what the query is searched *in*. It sits inside the search box rather
 * than on the results page because the choice decides which TecDoc strategy the
 * API runs — a descriptive query cannot match at all in the number lane — so it
 * has to be made before the search, not applied to results afterwards.
 */
export function SearchScopeSelect({ scope, onChange }: SearchScopeSelectProps) {
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

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  const selected =
    SCOPE_OPTIONS.find((option) => option.scope === scope) ?? SCOPE_OPTIONS[0];
  const SelectedIcon = SCOPE_ICON[selected.scope];

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Обхват на търсене: ${selected.title}`}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-sm px-2 text-[13px] font-medium transition-colors",
          isOpen ? "bg-ink text-white" : "text-ink-2 hover:bg-line",
        )}
      >
        <SelectedIcon
          className={cn("h-3.5 w-3.5", isOpen ? "text-white" : "text-brand")}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">{selected.label}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            isOpen ? "rotate-180 text-white" : "text-ink-4",
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="В какво да търсим"
          className="absolute left-0 top-[calc(100%+11px)] z-[60] w-[312px] rounded-md border border-line bg-bg-card p-1.5 shadow-overlay"
        >
          <p className="px-2.5 pb-2 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">
            В какво да търсим
          </p>

          {SCOPE_OPTIONS.map((option) => {
            const OptionIcon = SCOPE_ICON[option.scope];
            const isSelected = option.scope === scope;

            return (
              <button
                key={option.scope}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.scope);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-sm p-2.5 text-left transition-colors",
                  isSelected ? "bg-bg-sunken" : "hover:bg-canvas",
                )}
              >
                <span
                  className={cn(
                    "grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] border",
                    isSelected
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-canvas text-ink-3",
                  )}
                >
                  <OptionIcon className="h-4 w-4" aria-hidden="true" />
                </span>

                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-ink">
                    {option.title}
                  </span>
                  <span className="block text-[11.5px] leading-snug text-ink-3">
                    {option.description}
                  </span>
                </span>

                {isSelected && (
                  <Check
                    className="mt-1 h-3.5 w-3.5 shrink-0 text-brand"
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
