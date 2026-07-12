import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CriteriaFilter } from '../catalog/tecdoc/tecdoc-client';

export const SEARCH_DEFAULT_PAGE = 1;
export const SEARCH_DEFAULT_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGE_SIZE = 50;
export const SEARCH_MAX_FILTER_VALUES = 50;

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

export class SearchQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(SEARCH_MAX_FILTER_VALUES)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  brandIds?: string[];

  /**
   * The single selected category-tree node (TecDoc assemblyGroupNodeId).
   * Category navigation is a single-path drill-down, so this is a scalar — not
   * an array like {@link brandIds}.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryNodeId?: string;

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
   * Exact-phrase toggle (FE "Търси по точна фраза"). When on, the query is run
   * as an exact TecDoc number match instead of the default prefix/suffix or
   * free-text search. Accepts `?exact=true` / `?exact=1`; absent means off.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined
      ? undefined
      : value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  exact?: boolean;
}

/**
 * Parses the repeatable `attr` query param into criteria filters. Each entry is
 * a `criteriaId:rawValue` pair split on the FIRST colon, so a rawValue may
 * itself contain colons. Entries missing either side are dropped.
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

    const criteriaId = entry.slice(0, separatorIndex);
    const rawValue = entry.slice(separatorIndex + 1);
    if (rawValue.length > 0) {
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
}
