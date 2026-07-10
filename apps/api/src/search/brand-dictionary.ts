import { BrandDto } from '@vp-parts-shop/shared';

/**
 * Words that occur inside TecDoc brand names but must never be treated as a
 * strippable brand token on their own: they are generic (a part called an "oil
 * FILTER" would lose its type) or too weak to identify a brand. Kept uppercase.
 */
const GENERIC_BRAND_WORDS = new Set<string>([
  'FILTER',
  'FILTERS',
  'AUTO',
  'AUTOMOTIVE',
  'PARTS',
  'PART',
  'GROUP',
  'GMBH',
  'CO',
  'KG',
  'AG',
  'SA',
  'LTD',
  'INC',
  'INTERNATIONAL',
  'TECHNOLOGY',
  'TECHNOLOGIES',
  'MOTORS',
  'MOTOR',
  'SYSTEMS',
  'SYSTEM',
  'SPARE',
  'ORIGINAL',
  'GENUINE',
  'OE',
  'OEM',
]);

/**
 * Minimum length for a brand word to be considered a strippable token. Shorter
 * abbreviations that are genuinely brands must be added via {@link BRAND_ALIASES}
 * so we never strip a two-letter fragment that is really part of a number.
 */
const MIN_BRAND_TOKEN_LENGTH = 3;

/**
 * Short forms / aliases that do not fall out of `getBrands()` tokenisation on
 * their own. Deliberately tiny — the dictionary is TecDoc-sourced; this is only
 * the manual escape hatch for well-known abbreviations.
 */
export const BRAND_ALIASES: Record<string, string> = {
  ZF: 'ZF',
};

/**
 * Builds the set of uppercase brand tokens used to detect a brand prefix/suffix
 * in a pasted number. Sourced from TecDoc `getBrands()` (each brand name split
 * into significant words) plus the small alias map. Never a hardcoded enum.
 */
export function buildBrandTokenSet(brands: BrandDto[]): Set<string> {
  const tokens = new Set<string>();

  for (const brand of brands) {
    for (const token of tokenizeBrandName(brand.brandName)) {
      tokens.add(token);
    }
  }

  for (const alias of Object.keys(BRAND_ALIASES)) {
    tokens.add(alias.toUpperCase());
  }

  return tokens;
}

export function isBrandToken(token: string, brandTokens: Set<string>): boolean {
  return brandTokens.has(token.toUpperCase());
}

function tokenizeBrandName(brandName: string): string[] {
  return brandName
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(
      (token) =>
        token.length >= MIN_BRAND_TOKEN_LENGTH &&
        !GENERIC_BRAND_WORDS.has(token) &&
        !/^[0-9]+$/.test(token),
    );
}
