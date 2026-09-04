/**
 * How much input the dropdown needs before it asks for suggestions.
 *
 * Shared because both ends gate on it: the web withholds the request and the
 * API answers a shorter query with an empty list. Two copies of the number
 * drift, and either direction is silent — a lower web gate spends a request per
 * keystroke on a guaranteed empty answer, a lower API gate leaves suggestions
 * that exist unasked for.
 */
export const AUTOCOMPLETE_MIN_QUERY_LENGTH = 2;

/**
 * A single autocomplete suggestion, discriminated by search result kind.
 */
export type AutocompleteItemDto =
  | ArticleAutocompleteItemDto
  | CategoryAutocompleteItemDto
  | TermAutocompleteItemDto;

/**
 * A concrete article the frontend deep-links to.
 */
export interface ArticleAutocompleteItemDto {
  kind: 'article';
  articleNumber: string;
  /** TecDoc `dataSupplierId`; needed with the number to deep-link the part. */
  brandId: string;
  brandName: string;
  description: string;
  /**
   * A ~100px part photo, or null where the supplier filed none — measured at 45
   * of 48 rows carrying one. Deliberately a smaller asset than
   * `ArticleSummaryDto.thumbnailUrl`: this one is a dropdown row, not a list
   * row.
   */
  thumbnailUrl: string | null;
}

/**
 * A leaf assembly group used to scope a subsequent search.
 */
export interface CategoryAutocompleteItemDto {
  kind: 'category';
  term: string;
  categoryNodeId: string;
  label: string;
  count: number | null;
}

/**
 * A free-text term used to run a subsequent generic search.
 */
export interface TermAutocompleteItemDto {
  kind: 'term';
  term: string;
}
