import { Injectable } from '@nestjs/common';
import {
  ArticleAutocompleteItemDto,
  AutocompleteItemDto,
} from '@vp-parts-shop/shared';
import {
  CATEGORY_AUTOCOMPLETE_LIMIT,
  DEFAULT_AUTOCOMPLETE_EXECUTION,
  DEFAULT_SEARCH_MODE,
  EXACT_AUTOCOMPLETE_EXECUTION,
  SearchMode,
} from './search-types';
import { SearchCache } from './search-cache';

const AUTOCOMPLETE_MIN_QUERY_LENGTH = 3;
const AUTOCOMPLETE_MAX_SUGGESTIONS = 8;
const SUGGESTION_PREFIX_LENGTH = 5;

/**
 * The two suggestion surfaces: the live search-bar dropdown and the
 * "did you mean" recovery a zero-result search falls back to. Both are TecDoc
 * autocomplete reads, but they answer different questions and are cached
 * independently — see {@link suggestForZeroResults}.
 */
@Injectable()
export class AutocompleteService {
  constructor(private readonly cache: SearchCache) {}

  /**
   * Live autocomplete for the search bar. The client-selected {@link SearchMode}
   * (the same toggle that drives the search itself) picks the TecDoc source so
   * the dropdown matches how the search will run:
   * - `generic` → free-text term suggestions (`getAutoCompleteSuggestions`); a
   *   selected term re-runs a generic search.
   * - `part_number_exact` → exact-number article suggestions.
   * - `part_number` (default) → prefix-number article suggestions.
   */
  async autocomplete(
    query: string,
    searchMode: SearchMode = DEFAULT_SEARCH_MODE,
  ): Promise<AutocompleteItemDto[]> {
    const searchQuery = query.trim();
    if (searchQuery.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    const suggestions = await this.forMode(searchQuery, searchMode);

    return this.capSuggestions(suggestions);
  }

  /**
   * Zero-result "did you mean" recovery: on an empty result set, suggest real
   * articles whose number starts with the first few characters of the query
   * (the most common failure is a wrong/typoed ending). This is always an
   * article-prefix lookup regardless of the search mode — the no-results page
   * links each suggestion to an article detail page — so it uses its own cache
   * key, independent of the mode-scoped live autocomplete above.
   */
  async suggestForZeroResults(
    query: string,
  ): Promise<ArticleAutocompleteItemDto[]> {
    const prefix = query.slice(0, SUGGESTION_PREFIX_LENGTH);
    if (prefix.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    const suggestions = await this.cache.autocompleteArticles(
      prefix,
      DEFAULT_AUTOCOMPLETE_EXECUTION,
    );

    // The no-results page links each suggestion to an article detail page, so
    // keep only the article rows (the article autocomplete may also carry
    // category suggestions, which have nowhere to land here).
    return suggestions.filter(
      (item): item is ArticleAutocompleteItemDto => item.kind === 'article',
    );
  }

  /**
   * Routes a live autocomplete request to the mode's TecDoc source (see
   * {@link autocomplete}). Each source is cached under a key that carries the
   * mode so a part-number, exact, and generic dropdown for the same input never
   * collide.
   */
  private forMode(
    query: string,
    searchMode: SearchMode,
  ): Promise<AutocompleteItemDto[]> {
    if (searchMode === SearchMode.Generic) {
      return this.cache.autocompleteTerms(query);
    }

    const execution =
      searchMode === SearchMode.PartNumberExact
        ? EXACT_AUTOCOMPLETE_EXECUTION
        : DEFAULT_AUTOCOMPLETE_EXECUTION;

    return this.cache.autocompleteArticles(query, execution);
  }

  /**
   * Caps each suggestion kind independently so the article and term dropdowns
   * keep their limit while the appended category rows (part-number mode) are not
   * counted against — nor allowed to blow past — the article cap. Order is
   * preserved: the primary hits (articles or terms) come first, the category
   * rows after.
   */
  private capSuggestions(
    suggestions: AutocompleteItemDto[],
  ): AutocompleteItemDto[] {
    const primary = suggestions
      .filter((item) => item.kind !== 'category')
      .slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
    const categories = suggestions
      .filter((item) => item.kind === 'category')
      .slice(0, CATEGORY_AUTOCOMPLETE_LIMIT);

    return [...primary, ...categories];
  }
}
