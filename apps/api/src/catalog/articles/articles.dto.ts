import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Upper bound on the article numbers one availability request may carry.
 *
 * Every caller hydrates exactly one rendered page: the catalog grid and search
 * both cap their page size at 50, the substitutes tab at `SUBSTITUTES_LIMIT`,
 * and the buy box asks for a single number — so nothing legitimate comes close.
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
