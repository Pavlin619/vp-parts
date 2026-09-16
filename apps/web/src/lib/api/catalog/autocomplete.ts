import { queryOptions } from "@tanstack/react-query";
import {
  DEFAULT_SEARCH_MODE,
  type AutocompleteItemDto,
  type SearchMode,
} from "@vp-parts-shop/shared";
import { apiFetch } from "../index";

/**
 * Search itself lives in `../search`; only autocomplete is browser-side.
 *
 * The mode picks the suggestion source, so it must match the mode the search
 * will run in: `generic` yields free-text terms, the part-number modes yield
 * articles and the categories they fall into.
 */
export function getAutocomplete(
  query: string,
  mode: SearchMode = DEFAULT_SEARCH_MODE,
): Promise<AutocompleteItemDto[]> {
  const params = new URLSearchParams({ q: query });

  if (mode !== DEFAULT_SEARCH_MODE) {
    params.set("searchMode", mode);
  }

  return apiFetch<AutocompleteItemDto[]>(`/search/autocomplete?${params}`);
}

export const autocompleteQueryOptions = (
  query: string,
  mode: SearchMode = DEFAULT_SEARCH_MODE,
) =>
  queryOptions({
    // The mode is part of the key: the same term yields different suggestions
    // per mode, so sharing one entry would serve article rows to a free-text
    // search and vice versa.
    queryKey: ["catalog", "autocomplete", mode, query],
    queryFn: () => getAutocomplete(query, mode),
  });
