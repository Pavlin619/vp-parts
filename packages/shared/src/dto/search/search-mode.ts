/**
 * The search intent the client selects up front, mapped 1:1 from the header
 * search controls (a scope selector plus an "exact match" switch) so illegal
 * combinations — "generic + exact" — cannot be expressed. Each mode resolves to
 * a distinct TecDoc call plan on the API:
 *
 * - `part_number` (default) — a prefix/suffix number search over the
 *   brand-stripped query, then the raw query if it differs.
 * - `part_number_exact` — an exact number match over the raw query only.
 * - `generic` — a free-text search over article descriptions.
 *
 * Lives here rather than in either app because it is the wire contract: the web
 * app puts it in the `/search` URL and the API validates the same values.
 */
export const SearchMode = {
  PartNumber: 'part_number',
  PartNumberExact: 'part_number_exact',
  Generic: 'generic',
} as const;

export type SearchMode = (typeof SearchMode)[keyof typeof SearchMode];

export const DEFAULT_SEARCH_MODE: SearchMode = SearchMode.PartNumber;

export function isSearchMode(value: unknown): value is SearchMode {
  return Object.values(SearchMode).includes(value as SearchMode);
}
