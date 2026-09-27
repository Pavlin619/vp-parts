"use client";

import { useId, useState, type FocusEvent, type ReactNode } from "react";
import { MapPin, Search } from "lucide-react";
import type { DeliveryOfficeDto } from "@vp-parts-shop/shared";
import type { OfficeSuggestions } from "@/lib/checkout/delivery/office-search";

interface OfficeSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  suggestions: OfficeSuggestions;
  onPickCity: (city: string) => void;
  onPickOffice: (office: DeliveryOfficeDto) => void;
}

/** Narrows the list as the customer types, and offers matching cities and offices to jump to. */
export function OfficeSearch({
  query,
  onQueryChange,
  suggestions,
  onPickCity,
  onPickOffice,
}: OfficeSearchProps) {
  const suggestionsId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const hasSuggestions = suggestions.cities.length + suggestions.offices.length > 0;
  const isShowingSuggestions = isOpen && hasSuggestions;

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  };

  const pick = (choose: () => void) => {
    setIsOpen(false);
    choose();
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
          placeholder="Град, квартал, адрес или офис"
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
          {suggestions.cities.length > 0 && <SuggestionGroup>Градове</SuggestionGroup>}
          {suggestions.cities.map((city) => (
            <SuggestionButton key={city} onClick={() => pick(() => onPickCity(city))}>
              <MapPin className="h-[13px] w-[13px] shrink-0 text-ink-3" aria-hidden="true" />
              {city}
            </SuggestionButton>
          ))}

          {suggestions.offices.length > 0 && <SuggestionGroup>Офиси</SuggestionGroup>}
          {suggestions.offices.map((office) => (
            <SuggestionButton key={office.code} onClick={() => pick(() => onPickOffice(office))}>
              <span className="truncate">{office.name}</span>
              <small className="ml-auto shrink-0 text-[11.5px] text-ink-4">{office.city}</small>
            </SuggestionButton>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionGroup({ children }: { children: string }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
      {children}
    </p>
  );
}

function SuggestionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      // Safari does not focus a clicked button, so the search box's blur would close
      // the list before the click lands; keeping focus in the box lets it through.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
