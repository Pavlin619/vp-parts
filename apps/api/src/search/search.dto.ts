import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { STOCK_SCOPES, type StockScope } from '@vp-parts-shop/shared';
import { CriteriaFilter, SearchMode } from './search-types';

export const SEARCH_DEFAULT_PAGE = 1;
export const SEARCH_DEFAULT_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGE_SIZE = 50;
export const SEARCH_MAX_FILTER_VALUES = 50;

/**
 * The highest page any search can ask for, from TecDoc's own paging ceiling:
 * "You can only page through the first ~10,000 … results using this method."
 * At the smallest page size that is 10,000 pages; every larger page size caps
 * lower still, which the response's `maxAllowedPage` reports per query.
 *
 * A ceiling here is not about that per-query number — it is about refusing an
 * absurd one outright. Without it `?page=9999999` reaches TecDoc, comes back a
 * rejection, and surfaces as a 5xx; it also mints a Redis key and spends an
 * upstream call per attempt, which makes page number a free cache-cardinality
 * lever for anyone who wants one.
 */
export const SEARCH_MAX_PAGE = 10_000;

/**
 * Normalises a repeatable query param into a clean `string[]`. A single
 * `?brandIds=x` arrives as a string, `?brandIds=x&brandIds=y` as an array, and
 * an absent param as `undefined`; blanks are dropped so an empty filter never
 * over-narrows the search.
 */
function toStringArray({ value }: { value: unknown }): string[] | undefined {
  if (value == null) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];

  return values.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
}

/**
 * Normalises a repeatable id param into a `number[]`. TecDoc ids are numbers in
 * the JSON-RPC payload, so they become numbers here at the boundary and stay
 * that way inwards. A non-numeric entry converts to `NaN`, which `@IsInt` then
 * rejects with a 400 — deliberately, because these values are echoed back from a
 * facet block we served, so a broken one is a hand-edited URL.
 */
function toNumberArray({ value }: { value: unknown }): number[] | undefined {
  return toStringArray({ value })?.map(Number);
}

/**
 * Parses a `true`/`false` query param. Anything else — including a malformed
 * value — becomes `undefined`, so a caller can never turn a hint into a 400 on
 * an otherwise valid search.
 */
function toOptionalBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return undefined;
}

export class SearchQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  q!: string;

  /**
   * The selected vehicle (TecDoc linkageTargetId). Parsed to a number here so it
   * can go straight into the JSON-RPC payload: left as an unchecked string it
   * would reach `JSON.stringify` as `NaN`, serialise to `null`, and silently
   * widen the search instead of failing it.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vehicleId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_PAGE)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_PAGE_SIZE)
  pageSize?: number;

  /** Selected brands (TecDoc dataSupplierIds). */
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @ArrayMaxSize(SEARCH_MAX_FILTER_VALUES)
  @IsInt({ each: true })
  @Min(1, { each: true })
  brandIds?: number[];

  /** Selected product types (TecDoc genericArticleIds). */
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @ArrayMaxSize(SEARCH_MAX_FILTER_VALUES)
  @IsInt({ each: true })
  @Min(1, { each: true })
  productTypeIds?: number[];

  /**
   * The single selected category-tree node (TecDoc assemblyGroupNodeId).
   * Category navigation is a single-path drill-down, so this is a scalar — not
   * an array like {@link brandIds}.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryNodeId?: number;

  /**
   * Whether {@link categoryNodeId} has child categories, echoed back from the
   * `hasChildren` the client was given for that node. This is how a client opts
   * in to the attribute (dimension) facets: only an explicit `false` — "this is
   * a leaf" — asks for them. `true` or an absent/unparseable value means they are
   * not requested at all, so TecDoc never computes a criteria block spanning a
   * whole mid-level subtree. See `shouldRequestCriteriaFacets` in
   * `search-types.ts`.
   */
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  categoryHasChildren?: boolean;

  /**
   * Technical-attribute selections, each a repeatable `criteriaId:rawValue`
   * pair (e.g. `?attr=20:106.4&attr=44:Отпред`). Parsed into
   * {@link CriteriaFilter}s by {@link parseCriteriaFilters} in the controller.
   */
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(SEARCH_MAX_FILTER_VALUES)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  attr?: string[];

  /**
   * The search intent selected on the FE, mapped 1:1 from its controls:
   * `part_number` (default) runs a prefix/suffix number search, `part_number_exact`
   * an exact number match, and `generic` a free-text (type 99) search. Absent
   * means the service applies the default (`part_number`).
   */
  @IsOptional()
  @IsEnum(SearchMode)
  searchMode?: SearchMode;

  /**
   * Narrow to what one stock origin can ship — `central` for our own shelf,
   * `external` for supplier stock. Rejected rather than ignored when it is
   * neither: unlike the facet params this is not an id we served back, so an
   * unrecognised value is a request we cannot answer, and quietly widening it
   * would serve an unnarrowed list under a control saying otherwise.
   */
  @IsOptional()
  @IsIn(STOCK_SCOPES)
  stock?: StockScope;
}

/**
 * Parses the repeatable `attr` query param into criteria filters. Each entry is
 * a `criteriaId:rawValue` pair split on the FIRST colon, so a rawValue may
 * itself contain colons.
 *
 * A malformed entry is dropped rather than rejected, matching how the other
 * facet params behave — these values are echoed back from a facet block we
 * ourselves served, so a broken one means a hand-edited URL, not a caller who
 * deserves a 400 on an otherwise valid search. Dropping includes a criteriaId
 * that is not a TecDoc id: forwarding it would put `criteriaId: null` in the
 * payload, which TecDoc reads as a different filter rather than no filter.
 */
export function parseCriteriaFilters(attr?: string[]): CriteriaFilter[] {
  if (!attr?.length) {
    return [];
  }

  return attr.reduce<CriteriaFilter[]>((filters, entry) => {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex <= 0) {
      return filters;
    }

    const criteriaId = Number(entry.slice(0, separatorIndex));
    const rawValue = entry.slice(separatorIndex + 1);
    if (rawValue.length > 0 && Number.isInteger(criteriaId) && criteriaId > 0) {
      filters.push({ criteriaId, rawValue });
    }

    return filters;
  }, []);
}

export class AutocompleteQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /**
   * The search intent selected on the FE — the same toggle as
   * {@link SearchQueryDto.searchMode}. It picks the autocomplete source:
   * `generic` yields free-text term suggestions, `part_number`/
   * `part_number_exact` yield article suggestions. Absent means the service
   * applies the default (`part_number`).
   */
  @IsOptional()
  @IsEnum(SearchMode)
  searchMode?: SearchMode;
}
