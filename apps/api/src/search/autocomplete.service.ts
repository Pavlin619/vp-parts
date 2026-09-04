import { Injectable } from '@nestjs/common';
import {
  ArticleAutocompleteItemDto,
  AUTOCOMPLETE_MIN_QUERY_LENGTH,
  AutocompleteItemDto,
} from '@vp-parts-shop/shared';
import {
  ARTICLE_AUTOCOMPLETE_LIMIT,
  CATEGORY_AUTOCOMPLETE_LIMIT,
  DEFAULT_AUTOCOMPLETE_EXECUTION,
  DEFAULT_SEARCH_MODE,
  EXACT_AUTOCOMPLETE_EXECUTION,
  SearchMode,
  TERM_AUTOCOMPLETE_LIMIT,
} from './search-types';
import { SearchCache } from './search-cache';

const SUGGESTION_PREFIX_LENGTH = 5;

/**
 * One limit per kind rather than one for the dropdown, because the kinds answer
 * different questions and a shared budget lets the cheapest answer crowd out
 * the others: a three-character prefix matches thousands of articles, so a flat
 * cap is spent entirely on numbers before a single category is reached.
 */
const SUGGESTION_LIMITS: Record<AutocompleteItemDto['kind'], number> = {
  article: ARTICLE_AUTOCOMPLETE_LIMIT,
  term: TERM_AUTOCOMPLETE_LIMIT,
  category: CATEGORY_AUTOCOMPLETE_LIMIT,
};

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
   * Applies {@link SUGGESTION_LIMITS} per kind, keeping the source order — which
   * is what puts the articles above the category rows, since the TecDoc read
   * appends the categories to the articles it derived them from.
   */
  private capSuggestions(
    suggestions: AutocompleteItemDto[],
  ): AutocompleteItemDto[] {
    const keptPerKind = new Map<AutocompleteItemDto['kind'], number>();

    return suggestions.filter((item) => {
      const kept = keptPerKind.get(item.kind) ?? 0;
      if (kept >= SUGGESTION_LIMITS[item.kind]) {
        return false;
      }

      keptPerKind.set(item.kind, kept + 1);

      return true;
    });
  }
}
