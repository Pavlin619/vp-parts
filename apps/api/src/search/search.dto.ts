import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(SEARCH_MAX_FILTER_VALUES)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  categoryIds?: string[];
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
