"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Info, Search } from "lucide-react";
import type { AutocompleteItemDto } from "@vp-parts-shop/shared";
import { autocompleteQueryOptions } from "@/lib/api/catalog";
import { buildSearchUrl, newSearch } from "@/lib/catalog/search-url";
import { suggestionHref } from "@/lib/catalog/suggestion-href";
import { useHydration } from "@/hooks/use-vehicle-context";
import {
  looksLikeDescription,
  looksLikePartNumber,
  resolveSearchMode,
  useSearchModeStore,
  type SearchScope,
} from "@/hooks/use-search-mode";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { SearchScopeSelect } from "./search-scope-select";
import { SearchExactToggle } from "./search-exact-toggle";

const MIN_AUTOCOMPLETE_QUERY_LENGTH = 3;
const MAX_SUGGESTIONS = 8;

const PLACEHOLDER: Record<SearchScope, string> = {
  generic: "Напр. въздушен филтър BMW 320d",
  part: "OEM / каталожен номер, напр. 13717521033",
};

interface SearchBarProps {
  debounceMs?: number;
}

/**
 * The search box owns the search *mode*, not just the text: the scope and the
 * exact switch resolve to the API's `searchMode`, which picks the TecDoc
 * strategy and so must travel with the query rather than be applied to results
 * afterwards. Every submission therefore lands on `/search` with the mode
 * already in the URL.
 */
export function SearchBar({ debounceMs = 300 }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { scope, isExact } = usePersistedSearchMode();
  const setScope = useSearchModeStore((state) => state.setScope);
  const setExact = useSearchModeStore((state) => state.setExact);

  const mode = resolveSearchMode(scope, isExact);
  const debouncedQuery = useDebouncedValue(query.trim(), debounceMs);

  const canAutocomplete =
    debouncedQuery.length >= MIN_AUTOCOMPLETE_QUERY_LENGTH;
  const { data } = useQuery({
    ...autocompleteQueryOptions(debouncedQuery, mode),
    enabled: canAutocomplete,
  });

  const suggestions =
    isDropdownOpen && canAutocomplete ? (data ?? []).slice(0, MAX_SUGGESTIONS) : [];
  const isListVisible = suggestions.length > 0;

  // A query typed into the wrong scope does not match loosely, it does not
  // match at all; offer the switch rather than returning nothing and leaving
  // the visitor to work out why. Suppressed while suggestions are up, which
  // are the better answer when they exist.
  const scopeHint = isListVisible ? null : scopeHintFor(scope, query);

  function navigateTo(href: string) {
    setIsDropdownOpen(false);
    router.push(href);
  }

  function submitSearch(searchScope: SearchScope = scope) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    navigateTo(
      buildSearchUrl(
        newSearch({
          query: trimmedQuery,
          mode: resolveSearchMode(searchScope, isExact),
        }),
      ),
    );
  }

  function selectSuggestion(suggestion: AutocompleteItemDto) {
    navigateTo(suggestionHref(suggestion, { mode }));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.altKey && event.code === "KeyE" && scope === "part") {
      event.preventDefault();
      setExact(!isExact);
      return;
    }

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
      selectSuggestion(suggestions[activeIndex]);
    }
  }

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault();
        submitSearch();
      }}
    >
      <label htmlFor="part-search" className="sr-only">
        Търсене по номер, наименование или код
      </label>

      <div className="flex h-11 items-center gap-1 rounded-lg border border-line bg-bg-sunken pl-1.5 pr-1.5 focus-within:border-ink focus-within:bg-bg-card">
        <SearchScopeSelect scope={scope} onChange={setScope} />

        <span className="h-[22px] w-px shrink-0 bg-line" aria-hidden="true" />

        <Search className="ml-1 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />

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
          placeholder={PLACEHOLDER[scope]}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsDropdownOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none",
            scope === "part" && "font-mono text-[13.5px]",
          )}
        />

        {scope === "part" && (
          <SearchExactToggle isExact={isExact} onChange={setExact} />
        )}

        <button
          type="submit"
          className="h-7 shrink-0 rounded-md bg-ink px-3 text-xs font-medium text-white transition-colors hover:bg-ink/90"
        >
          Търси
        </button>
      </div>

      {scopeHint && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-[55] flex items-center gap-2.5 rounded-md border border-brand/30 bg-brand-soft py-2 pl-3 pr-2.5 text-[12.5px]">
          <Info className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
          <span className="flex-1 text-ink-2">
            „{query.trim()}“ {scopeHint.reason}
          </span>
          <button
            type="button"
            onClick={() => {
              setScope(scopeHint.scope);
              submitSearch(scopeHint.scope);
            }}
            className="shrink-0 text-xs font-semibold text-brand hover:underline"
          >
            {scopeHint.action}
          </button>
        </div>
      )}

      {isListVisible && (
        <ul
          id="part-search-suggestions"
          role="listbox"
          aria-label="Предложения за части"
          className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-bg-card shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestionKey(suggestion)}
              id={`part-search-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "cursor-pointer px-4 py-2 text-sm",
                index === activeIndex ? "bg-bg-sunken" : "hover:bg-bg-sunken",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <SuggestionRow suggestion={suggestion} />
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

interface ScopeHint {
  scope: SearchScope;
  reason: string;
  action: string;
}

/**
 * The offer to re-run the query in the other scope. Only ever an offer —
 * neither predicate is certain enough to switch on someone's behalf.
 */
function scopeHintFor(scope: SearchScope, query: string): ScopeHint | null {
  if (scope === "generic" && looksLikePartNumber(query)) {
    return {
      scope: "part",
      reason: "прилича на номер на част.",
      action: "Търси като номер →",
    };
  }

  if (scope === "part" && looksLikeDescription(query)) {
    return {
      scope: "generic",
      reason: "прилича на описание, а не на номер.",
      action: "Търси по описание →",
    };
  }

  return null;
}

function SuggestionRow({ suggestion }: { suggestion: AutocompleteItemDto }) {
  if (suggestion.kind === "article") {
    return (
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-ink">
          {suggestion.articleNumber}
        </span>
        <span className="text-xs font-semibold uppercase text-muted">
          {suggestion.brandName}
        </span>
        <span className="truncate text-xs text-muted">
          {suggestion.description}
        </span>
      </span>
    );
  }

  if (suggestion.kind === "term") {
    return <span className="text-sm text-ink">{suggestion.term}</span>;
  }

  return (
    <span className="flex items-baseline gap-2">
      <span className="text-xs text-muted">
        „{suggestion.term}“ в
      </span>
      <span className="flex-1 truncate text-sm text-ink">
        {suggestion.label}
      </span>
      {suggestion.count !== null && (
        <span className="font-display text-xs text-ink-4">
          {suggestion.count}
        </span>
      )}
    </span>
  );
}

/**
 * Two brands can file one article number, so the number alone is not a stable
 * React key — it would collapse two distinct suggestions into one row.
 */
function suggestionKey(suggestion: AutocompleteItemDto): string {
  if (suggestion.kind === "article") {
    return `article-${suggestion.brandId}-${suggestion.articleNumber}`;
  }

  return suggestion.kind === "term"
    ? `term-${suggestion.term}`
    : `category-${suggestion.categoryNodeId}`;
}

/**
 * The persisted scope and exact switch, held back until hydration so the first
 * client render matches the server HTML. Both fall back to the store's own
 * defaults, which is exactly what the server rendered.
 */
function usePersistedSearchMode(): { scope: SearchScope; isExact: boolean } {
  const isHydrated = useHydration();
  const storedScope = useSearchModeStore((state) => state.scope);
  const storedExact = useSearchModeStore((state) => state.isExact);
  const initial = useSearchModeStore.getInitialState();

  return {
    scope: isHydrated ? storedScope : initial.scope,
    isExact: isHydrated ? storedExact : initial.isExact,
  };
}
