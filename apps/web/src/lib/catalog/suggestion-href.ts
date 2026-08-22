import {
  SearchMode,
  type AutocompleteItemDto,
} from "@vp-parts-shop/shared";
import { articleDetailHref } from "./article-href";
import { buildSearchUrl, drillIntoCategory, newSearch } from "./search-url";

interface SuggestionContext {
  mode: SearchMode;
  vehicleId?: string;
}

/**
 * Where an autocomplete suggestion leads. The three kinds are three different
 * intents, not three renderings of one:
 *
 * - `article` deep-links the part, since the suggestion already identified it.
 * - `term` re-runs the typed text as a free-text search — it is a description,
 *   so it can only match in generic mode whatever the box was set to.
 * - `category` re-runs the same query narrowed to that assembly group. The API
 *   only ever suggests leaf categories, which is why `hasChildren` is `false`
 *   here — and why landing there also unlocks the dimension filters.
 */
export function suggestionHref(
  suggestion: AutocompleteItemDto,
  context: SuggestionContext,
): string {
  if (suggestion.kind === "article") {
    return articleDetailHref(suggestion.brandId, suggestion.articleNumber);
  }

  if (suggestion.kind === "term") {
    return buildSearchUrl(
      newSearch({
        query: suggestion.term,
        mode: SearchMode.Generic,
        vehicleId: context.vehicleId,
      }),
    );
  }

  return buildSearchUrl(
    drillIntoCategory(
      newSearch({
        query: suggestion.term,
        mode: context.mode,
        vehicleId: context.vehicleId,
      }),
      { id: suggestion.categoryNodeId, hasChildren: false },
    ),
  );
}
