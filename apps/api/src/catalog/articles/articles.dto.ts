import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ArticleIdentityDto, articleIdentityKey } from '@vp-parts-shop/shared';

/**
 * Upper bound on the articles one availability request may carry.
 *
 * Every caller hydrates exactly one rendered page: the catalog grid, search and
 * the substitutes tab all cap their page size at 50, and the buy box asks for a
 * single article — so nothing legitimate comes close.
 * The cap exists because this endpoint is deliberately never cached and fans one
 * request out into a single `IN (...)` against the shared database, which makes
 * an unbounded list the cheapest way to make that database everyone's problem.
 */
export const AVAILABILITY_MAX_ARTICLES = 50;

/**
 * Longest article number accepted. Real TecDoc numbers are well under this; the
 * limit only stops a caller padding the batch with megabyte-long junk.
 */
const MAX_ARTICLE_NUMBER_LENGTH = 50;

/** One article to price, as it arrives on the query string. */
export class ArticleIdentityQueryDto implements ArticleIdentityDto {
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  brandId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ARTICLE_NUMBER_LENGTH)
  articleNumber!: string;
}

/**
 * Parses the `articles` query into a de-duplicated list of article identities.
 *
 * Each token is `brandId:articleNumber` — both halves, because a number is
 * unique only within a brand and pricing one brand's part from another's stock
 * is exactly what this endpoint must not do. Split on the *first* colon: a brand
 * id is digits only, so anything after it belongs to the number.
 *
 * Accepts both the comma-separated form the frontend sends (`?articles=30:A1,1:A2`)
 * and the repeated-param form (`?articles=30:A1&articles=1:A2`), since a query
 * string can express either and neither is worth rejecting. Blank tokens are
 * dropped; an absent value yields an empty list, which
 * {@link ArticlesAvailabilityQueryDto} then rejects. A token that carries no
 * brand is kept and left to fail validation, because a caller dropping half the
 * identity is a bug worth a 400 rather than a quietly shorter answer.
 */
export function parseArticleIdentities(
  value: unknown,
): ArticleIdentityQueryDto[] {
  const raw = Array.isArray(value) ? value : [value];

  const byKey = new Map<string, ArticleIdentityQueryDto>();
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue;
    }

    for (const token of entry.split(',')) {
      const identity = toIdentity(token);
      if (identity) {
        byKey.set(
          articleIdentityKey(identity.brandId, identity.articleNumber),
          identity,
        );
      }
    }
  }

  return [...byKey.values()];
}

function toIdentity(token: string): ArticleIdentityQueryDto | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const separator = trimmed.indexOf(':');
  const identity = new ArticleIdentityQueryDto();
  identity.brandId = separator === -1 ? '' : trimmed.slice(0, separator).trim();
  identity.articleNumber = trimmed.slice(separator + 1).trim();

  return identity;
}

/**
 * Query for the live availability endpoint.
 *
 * An empty list is a 400 rather than an empty response on purpose: the caller
 * gets back a map keyed by article, so `{}` would read as "none of these are in
 * stock" and render a whole grid as out of stock. A request that asks about
 * nothing is a caller bug, and it should look like one.
 */
export class ArticlesAvailabilityQueryDto {
  @Transform(({ value }: { value: unknown }) => parseArticleIdentities(value))
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(AVAILABILITY_MAX_ARTICLES)
  @ValidateNested({ each: true })
  articles!: ArticleIdentityQueryDto[];
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
