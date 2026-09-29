"use client";

import { useId, useState, type FocusEvent } from "react";
import { Search } from "lucide-react";
import type { DeliveryOfficeDto } from "@vp-parts-shop/shared";
import { SuggestionButton } from "../suggestion-button";

interface OfficeSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  suggestions: DeliveryOfficeDto[];
  onPickOffice: (office: DeliveryOfficeDto) => void;
}

/** Narrows the list as the customer types, and offers matching offices anywhere to jump to. */
export function OfficeSearch({
  query,
  onQueryChange,
  suggestions,
  onPickOffice,
}: OfficeSearchProps) {
  const suggestionsId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const isShowingSuggestions = isOpen && suggestions.length > 0;

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  };

  const pick = (office: DeliveryOfficeDto) => {
    setIsOpen(false);
    onPickOffice(office);
  };

  return (
    <div className="relative min-w-0" onBlur={closeWhenFocusLeaves}>
      <div className="flex h-[42px] items-center gap-2 rounded-lg border border-line bg-bg-card px-3 focus-within:border-ink">
        <Search className="h-[15px] w-[15px] shrink-0 text-ink-3" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => event.key === "Escape" && setIsOpen(false)}
          placeholder="Квартал, адрес или име на офис"
          aria-label="Търсене на офис"
          aria-controls={suggestionsId}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-4 focus:outline-none"
        />
      </div>

      {isShowingSuggestions && (
        <div
          id={suggestionsId}
          aria-label="Предложения"
          className="absolute inset-x-0 top-[46px] z-20 flex flex-col rounded-lg border border-line bg-bg-card p-1.5 shadow-modal"
        >
          {suggestions.map((office) => (
            <SuggestionButton key={office.code} onClick={() => pick(office)}>
              <span className="truncate">{office.name}</span>
              <small className="ml-auto shrink-0 text-[11.5px] text-ink-4">{office.city}</small>
            </SuggestionButton>
          ))}
        </div>
      )}
    </div>
  );
}
