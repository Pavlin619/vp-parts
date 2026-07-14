import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CriteriaFilter, SearchMode } from './search-types';

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
   * The search intent selected on the FE, mapped 1:1 from its controls:
   * `part_number` (default) runs a prefix/suffix number search, `part_number_exact`
   * an exact number match, and `generic` a free-text (type 99) search. Absent
   * means the service applies the default (`part_number`).
   */
  @IsOptional()
  @IsEnum(SearchMode)
  searchMode?: SearchMode;
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
