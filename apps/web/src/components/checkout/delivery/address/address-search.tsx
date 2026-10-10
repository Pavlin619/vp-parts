"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";

const MIN_QUERY_LENGTH = 2;

/**
 * The quickest way to an address: type it and pick a match. Matches arrive with the
 * carrier's address lookup; until then it points the customer to the fields below.
 */
export function AddressSearch() {
  const hintId = useId();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const isShowingHint = isFocused && query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div className="relative">
      <div className="flex h-[42px] items-center gap-2 rounded-lg border border-line-2 bg-bg-card px-3 text-ink-3 focus-within:border-ink focus-within:ring-[3px] focus-within:ring-ink/5">
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Започни да пишеш адрес — улица, номер, град…"
          aria-label="Търсене на адрес"
          aria-describedby={isShowingHint ? hintId : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-4 focus:outline-none"
        />
      </div>

      {isShowingHint && (
        <p
          id={hintId}
          className="absolute inset-x-0 top-[46px] z-20 rounded-lg border border-line-2 bg-bg-card p-3 text-[12px] text-ink-3 shadow-modal"
        >
          Не намираме адреса — попълни го ръчно по-долу.
        </p>
      )}
    </div>
  );
}
