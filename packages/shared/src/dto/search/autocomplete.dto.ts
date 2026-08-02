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
