import { isBrandToken } from './brand-dictionary';

export interface ParsedQuery {
  /** The trimmed query exactly as typed (only whitespace-trimmed). */
  raw: string;
  /**
   * The query with any leading/trailing brand token removed. Equal to {@link raw}
   * when no brand token was found. Punctuation inside the number is never
   * touched.
   */
  brandStripped: string;
}

/**
 * Prepares a search query by conservatively removing a brand token that sits at
 * the very start or end of the input (e.g. `"WA5432 WIX"` → `"WA5432"`). We make
 * no assumptions about TecDoc-side normalisation, so this is the ONLY
 * transformation applied — characters inside a token (dots, dashes, slashes) are
 * preserved verbatim, and the original query is kept as a fallback candidate in
 * case the "brand" token was actually part of the number.
 *
 * A token is only stripped when at least one non-brand token remains, so a bare
 * brand query like `"BOSCH"` is passed through untouched.
 */
export function parseQuery(
  rawQuery: string,
  brandTokens: Set<string>,
): ParsedQuery {
  const raw = rawQuery.trim();
  const tokens = raw.split(/\s+/).filter((token) => token.length > 0);

  if (tokens.length <= 1) {
    return { raw, brandStripped: raw };
  }

  let start = 0;
  let end = tokens.length;
  const stripped: string[] = [];

  while (end - start > 1 && isBrandToken(tokens[start], brandTokens)) {
    stripped.push(tokens[start]);
    start += 1;
  }

  while (end - start > 1 && isBrandToken(tokens[end - 1], brandTokens)) {
    stripped.push(tokens[end - 1]);
    end -= 1;
  }

  if (stripped.length === 0) {
    return { raw, brandStripped: raw };
  }

  return {
    raw,
    brandStripped: tokens.slice(start, end).join(' '),
  };
}
