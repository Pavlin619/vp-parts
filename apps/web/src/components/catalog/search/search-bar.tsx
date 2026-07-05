"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { autocompleteQueryOptions } from "@/lib/api/catalog";
import { useVehicleContext } from "@/hooks/use-vehicle-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

const MIN_AUTOCOMPLETE_QUERY_LENGTH = 3;
const MAX_SUGGESTIONS = 8;

interface SearchBarProps {
  debounceMs?: number;
}

export function SearchBar({ debounceMs = 300 }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedVehicle = useVehicleContext((state) => state.selectedVehicle);
  const debouncedQuery = useDebouncedValue(query.trim(), debounceMs);

  const canAutocomplete =
    debouncedQuery.length >= MIN_AUTOCOMPLETE_QUERY_LENGTH;
  const { data } = useQuery({
    ...autocompleteQueryOptions(debouncedQuery),
    enabled: canAutocomplete,
  });

  const suggestions =
    isDropdownOpen && canAutocomplete
      ? (data ?? []).slice(0, MAX_SUGGESTIONS)
      : [];
  const isListVisible = suggestions.length > 0;

  function navigateToSearch() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    const params = new URLSearchParams({ q: trimmedQuery });
    if (selectedVehicle) {
      params.set("vehicleId", selectedVehicle.vehicleId);
    }

    setIsDropdownOpen(false);
    router.push(`/search?${params}`);
  }

  function navigateToArticle(articleNumber: string) {
    setIsDropdownOpen(false);
    router.push(`/catalog/articles/${encodeURIComponent(articleNumber)}`);
  }

  function handleChange(value: string) {
    setQuery(value);
    setIsDropdownOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isListVisible) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      navigateToArticle(suggestions[activeIndex].articleNumber);
    }
  }

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault();
        navigateToSearch();
      }}
    >
      <label htmlFor="part-search" className="sr-only">
        Търсене по номер, наименование или код
      </label>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
          aria-hidden="true"
        />
        <input
          id="part-search"
          type="search"
          role="combobox"
          autoComplete="off"
          aria-expanded={isListVisible}
          aria-controls="part-search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `part-search-option-${activeIndex}` : undefined
          }
          placeholder="Търсене по номер (OEM), наименование или код…"
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full h-10 pl-10 pr-20 bg-bg-sunken border border-line rounded-lg text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink focus:bg-bg-card"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 rounded-md bg-ink text-white text-xs font-medium hover:bg-ink/90 transition-colors"
          aria-label="Търси"
        >
          Търси
        </button>
      </div>

      {isListVisible && (
        <ul
          id="part-search-suggestions"
          role="listbox"
          aria-label="Предложения за части"
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-card border border-line rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.articleNumber}
              id={`part-search-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "flex items-baseline gap-2 px-4 py-2 cursor-pointer text-sm",
                index === activeIndex ? "bg-bg-sunken" : "hover:bg-bg-sunken",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                navigateToArticle(suggestion.articleNumber);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="font-mono text-xs text-ink">
                {suggestion.articleNumber}
              </span>
              <span className="text-xs font-semibold text-muted uppercase">
                {suggestion.brandName}
              </span>
              <span className="text-xs text-muted truncate">
                {suggestion.description}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
