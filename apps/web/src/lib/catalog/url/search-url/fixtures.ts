import { SearchMode } from "@vp-parts-shop/shared";
import { newSearch, type SearchUrlState } from "./index";

export function state(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: "WL6340", mode: SearchMode.PartNumber }),
    ...overrides,
  };
}

/** The built URL's query string, decoded so assertions stay readable. */
export function query(built: string): string {
  return decodeURIComponent(built.replace("/search?", ""));
}
