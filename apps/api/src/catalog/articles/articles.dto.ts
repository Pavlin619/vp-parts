import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Upper bound on the article numbers one availability request may carry.
 *
 * Every caller hydrates exactly one rendered page: the catalog grid, search and
 * the substitutes tab all cap their page size at 50, and the buy box asks for a
 * single number — so nothing legitimate comes close.
 * The cap exists because this endpoint is deliberately never cached and fans one
 * request out into a single `IN (...)` against the shared database, which makes
 * an unbounded list the cheapest way to make that database everyone's problem.
 */
export const AVAILABILITY_MAX_ARTICLE_NUMBERS = 50;

/**
 * Longest article number accepted. Real TecDoc numbers are well under this; the
 * limit only stops a caller padding the batch with megabyte-long junk.
 */
const MAX_ARTICLE_NUMBER_LENGTH = 50;

/**
 * Parses the `numbers` query into a de-duplicated list of article numbers.
 *
 * Accepts both the comma-separated form the frontend sends (`?numbers=A1,A2`)
 * and the repeated-param form (`?numbers=A1&numbers=A2`), since a query string
 * can express either and neither is worth rejecting. Blank tokens are dropped;
 * an absent value yields an empty list, which {@link ArticlesAvailabilityQueryDto}
 * then rejects.
 */
export function parseArticleNumbers(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];

  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue;
    }

    for (const token of entry.split(',')) {
      const trimmed = token.trim();
      if (trimmed) {
        seen.add(trimmed);
      }
    }
  }

  return [...seen];
}

/**
 * Query for the live availability endpoint.
 *
 * An empty list is a 400 rather than an empty response on purpose: the caller
 * gets back a map keyed by article number, so `{}` would read as "none of these
 * are in stock" and render a whole grid as out of stock. A request that asks
 * about nothing is a caller bug, and it should look like one.
 */
export class ArticlesAvailabilityQueryDto {
  @Transform(({ value }: { value: unknown }) => parseArticleNumbers(value))
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(AVAILABILITY_MAX_ARTICLE_NUMBERS)
  @IsString({ each: true })
  @MaxLength(MAX_ARTICLE_NUMBER_LENGTH, { each: true })
  numbers!: string[];
}

export const ARTICLE_DEFAULT_PAGE = 1;
export const ARTICLE_DEFAULT_PAGE_SIZE = 20;

/**
 * Ceiling on a page of articles. One page is what a hydration read costs — the
 * substitutes route fetches images, criteria and OE numbers per row — so this is
 * a cost bound rather than a formality.
 */
export const ARTICLE_MAX_PAGE_SIZE = 50;

/**
 * Highest page an article listing may ask for — TecDoc's own paging ceiling of
 * roughly 10,000 results, the same bound `SEARCH_MAX_PAGE` documents at length.
 * Without it `?page=9999999` reaches TecDoc, comes back a rejection that surfaces
 * as a 5xx, and mints a Redis key per attempt on the way.
 */
export const ARTICLE_MAX_PAGE = 10_000;

/**
 * Paging for the article listing and the substitutes route.
 *
 * Bounded here rather than clamped in the controller so an out-of-range page is
 * a 400 the caller can see, the way every other query param on this module
 * behaves. A silently clamped `pageSize=500` looks to the caller like a page of
 * 500 that happened to hold 50 rows.
 */
export class ArticlePageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ARTICLE_MAX_PAGE)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ARTICLE_MAX_PAGE_SIZE)
  pageSize?: number;
}
