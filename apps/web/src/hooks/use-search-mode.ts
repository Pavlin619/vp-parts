"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SearchMode } from "@vp-parts-shop/shared";

/**
 * What the visitor is searching *in*. Two scopes rather than three modes
 * because "exact" only qualifies a number search — pairing a scope with a
 * separate switch is what makes the illegal "generic + exact" combination
 * unrepresentable in the UI, mirroring the API's own mode enum.
 */
export type SearchScope = "generic" | "part";

interface SearchModeState {
  scope: SearchScope;
  isExact: boolean;
  setScope: (scope: SearchScope) => void;
  setExact: (isExact: boolean) => void;
  toggleExact: () => void;
}

/**
 * Defaults to the number scope, because that is what the box is mostly used
 * for: a visitor arrives with a number in hand from an invoice, an old part or
 * another shop's listing. It also matches `DEFAULT_SEARCH_MODE`, so a bare
 * `/search?q=…` link and a search typed into the header run the same lane.
 *
 * A descriptive query typed in this scope matches nothing rather than matching
 * loosely, which is why `looksLikePartNumber` powers a switch offer in the
 * other direction — see {@link SearchBar}.
 */
export const useSearchModeStore = create<SearchModeState>()(
  persist(
    (set) => ({
      scope: "part",
      isExact: false,
      setScope: (scope) => set({ scope }),
      setExact: (isExact) => set({ isExact }),
      toggleExact: () => set((state) => ({ isExact: !state.isExact })),
    }),
    { name: "vp-search-mode", version: 1 },
  ),
);

export function resolveSearchMode(
  scope: SearchScope,
  isExact: boolean,
): SearchMode {
  if (scope === "generic") {
    return SearchMode.Generic;
  }

  return isExact ? SearchMode.PartNumberExact : SearchMode.PartNumber;
}

export function scopeForSearchMode(mode: SearchMode): SearchScope {
  return mode === SearchMode.Generic ? "generic" : "part";
}

/**
 * Four because Bosch files numbers as four space-separated groups
 * ("F 026 400 237"), and a query that long is still plausibly a number.
 */
const MAX_PART_NUMBER_TOKENS = 4;

/** Below this the query is still half-typed and either hint would just flicker. */
const MIN_HINT_QUERY_LENGTH = 4;

const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * Whether a typed query looks like a part number, used to offer a one-click
 * switch when someone pastes "13717521033" into a descriptive search. Cyrillic
 * rules a string out outright; otherwise it must be short, digit-bearing and
 * free of the punctuation that only appears in prose.
 *
 * Deliberately loose — it only ever offers a suggestion, never redirects — so a
 * false positive costs a line of UI and a false negative costs a lost search.
 */
export function looksLikePartNumber(query: string): boolean {
  const trimmed = query.trim();

  if (trimmed.length < MIN_HINT_QUERY_LENGTH || CYRILLIC.test(trimmed)) {
    return false;
  }

  if (!/\d/.test(trimmed) || !/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(trimmed)) {
    return false;
  }

  return (
    trimmed.replace(/[^A-Za-z0-9]/g, "").length >= 5 &&
    trimmed.split(/\s+/).length <= MAX_PART_NUMBER_TOKENS
  );
}

/**
 * The mirror of {@link looksLikePartNumber}: whether a query looks like prose.
 * This is the likelier mistake now that the number scope is preselected, and
 * the number lane matches a description not loosely but not at all.
 *
 * Cyrillic settles it outright in a Bulgarian shop; failing that, the absence
 * of any digit does, which also catches a bare brand name ("BOSCH") that the
 * number lane cannot answer either.
 *
 * The two predicates cannot both hold: a part number needs a digit and no
 * Cyrillic, which is exactly what rules a description in.
 */
export function looksLikeDescription(query: string): boolean {
  const trimmed = query.trim();

  if (trimmed.length < MIN_HINT_QUERY_LENGTH) {
    return false;
  }

  return CYRILLIC.test(trimmed) || !/\d/.test(trimmed);
}
