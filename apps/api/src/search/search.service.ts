import { Injectable } from '@nestjs/common';
import {
  ArticleListItemDto,
  AutocompleteItemDto,
  SearchResponseDto,
  SearchResultItemDto,
} from '@vp-parts-shop/shared';
import { SearchMatchType } from '../catalog/tecdoc/tecdoc-client';
import { CatalogService } from '../catalog/catalog.service';
import { PartNumberNormaliser } from './normaliser';

const AUTOCOMPLETE_MIN_QUERY_LENGTH = 3;
const AUTOCOMPLETE_MAX_SUGGESTIONS = 8;
const SUGGESTION_PREFIX_LENGTH = 5;

@Injectable()
export class SearchService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly normaliser: PartNumberNormaliser,
  ) {}

  async search(query: string, vehicleId?: string): Promise<SearchResponseDto> {
    const normalisedQuery = this.normaliser.normalise(query);
    const { results, effectiveQuery, effectiveMatchType } =
      await this.executeSearchWithFallback(normalisedQuery, query);

    if (results.length === 1) {
      const articleNumber = encodeURIComponent(results[0].articleNumber);
      return { redirect: `/catalog/articles/${articleNumber}` };
    }

    const fittingNumbers = await this.findFittingNumbers(
      effectiveQuery,
      effectiveMatchType,
      vehicleId,
      results.length,
    );

    const suggestions = await this.buildSuggestions(
      results.length,
      normalisedQuery,
    );

    return {
      query,
      normalisedQuery,
      results: results.map((item) => this.toSearchResult(item, fittingNumbers)),
      ...(suggestions.length > 0 && { suggestions }),
    };
  }

  async autocomplete(query: string): Promise<AutocompleteItemDto[]> {
    if (query.trim().length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    const normalisedQuery = this.normaliser.normalise(query);
    const suggestions =
      await this.catalog.getAutocompleteSuggestions(normalisedQuery);

    return suggestions.slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
  }

  private async executeSearchWithFallback(
    normalisedQuery: string,
    rawQuery: string,
  ): Promise<{
    results: ArticleListItemDto[];
    effectiveQuery: string;
    effectiveMatchType: SearchMatchType;
  }> {
    // Tier 1 — exact match on standard-normalised query (precision first)
    let results = await this.catalog.searchArticles(
      normalisedQuery,
      undefined,
      'exact',
    );
    if (results.length > 0) {
      return {
        results,
        effectiveQuery: normalisedQuery,
        effectiveMatchType: 'exact',
      };
    }

    // Tier 2 — prefix-or-suffix on standard-normalised query
    results = await this.catalog.searchArticles(
      normalisedQuery,
      undefined,
      'prefix_or_suffix',
    );
    if (results.length > 0) {
      return {
        results,
        effectiveQuery: normalisedQuery,
        effectiveMatchType: 'prefix_or_suffix',
      };
    }

    // Tiers 3 & 4 — repeat with aggressive normalisation (strips all
    // non-alphanumeric chars beyond the standard `-`, `.`, space removal).
    // Skipped when the aggressive form is identical to the standard one.
    const aggressiveQuery = this.normaliser.aggressiveNormalise(rawQuery);
    if (aggressiveQuery !== null && aggressiveQuery !== normalisedQuery) {
      results = await this.catalog.searchArticles(
        aggressiveQuery,
        undefined,
        'exact',
      );
      if (results.length > 0) {
        return {
          results,
          effectiveQuery: aggressiveQuery,
          effectiveMatchType: 'exact',
        };
      }

      results = await this.catalog.searchArticles(
        aggressiveQuery,
        undefined,
        'prefix_or_suffix',
      );
      if (results.length > 0) {
        return {
          results,
          effectiveQuery: aggressiveQuery,
          effectiveMatchType: 'prefix_or_suffix',
        };
      }
    }

    return {
      results: [],
      effectiveQuery: normalisedQuery,
      effectiveMatchType: 'prefix_or_suffix',
    };
  }

  private async findFittingNumbers(
    effectiveQuery: string,
    matchType: SearchMatchType,
    vehicleId: string | undefined,
    resultCount: number,
  ): Promise<Set<string> | null> {
    if (vehicleId == null || resultCount === 0) {
      return null;
    }

    const fitting = await this.catalog.searchArticles(
      effectiveQuery,
      vehicleId,
      matchType,
    );
    return new Set(fitting.map((item) => item.articleNumber));
  }

  private async buildSuggestions(
    resultCount: number,
    normalisedQuery: string,
  ): Promise<AutocompleteItemDto[]> {
    if (resultCount > 0) {
      return [];
    }

    const prefix = normalisedQuery.slice(0, SUGGESTION_PREFIX_LENGTH);
    if (prefix.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return [];
    }

    return this.catalog.getAutocompleteSuggestions(prefix);
  }

  private toSearchResult(
    item: ArticleListItemDto,
    fittingNumbers: Set<string> | null,
  ): SearchResultItemDto {
    return {
      articleNumber: item.articleNumber,
      brandName: item.brandName,
      description: item.description,
      available: item.available,
      bestPriceIncVat: item.bestPriceIncVat,
      fitsVehicle:
        fittingNumbers !== null ? fittingNumbers.has(item.articleNumber) : null,
    };
  }
}
