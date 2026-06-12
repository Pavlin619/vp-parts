import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleNumber } from '@vp-parts-shop/shared';

/**
 * Default brand dictionary covering the most common suppliers on the
 * Bulgarian market. Overridable at runtime via the SEARCH_BRAND_DICTIONARY
 * env var (comma-separated list) without a code change.
 */
const DEFAULT_BRAND_DICTIONARY = [
  'WIX',
  'BOSCH',
  'MANN',
  'MAHLE',
  'VALEO',
  'FEBI',
  'SACHS',
  'SKF',
  'NGK',
  'BERU',
  'DENSO',
  'FRAM',
  'DAYCO',
  'GATES',
  'CONTITECH',
  'HELLA',
  'OSRAM',
  'PHILIPS',
  'LIQUI MOLY',
];

@Injectable()
export class PartNumberNormaliser {
  private readonly brandTokenSequences: string[][];

  constructor(config: ConfigService) {
    const configured = config.get<string>('SEARCH_BRAND_DICTIONARY');
    const brands = configured
      ? configured
          .split(',')
          .map((brand) => brand.trim())
          .filter(Boolean)
      : DEFAULT_BRAND_DICTIONARY;

    this.brandTokenSequences = brands.map((brand) =>
      brand.toUpperCase().split(/\s+/),
    );
  }

  /**
   * Normalisation pipeline (research.md §2):
   * trim → tokenise → strip brand tokens → join → remove hyphens/dots →
   * remove spaces → uppercase → ArticleNumber value object.
   */
  normalise(input: string): ArticleNumber {
    const tokens = input.trim().split(/\s+/).filter(Boolean);

    const withoutBrands = this.stripBrandTokens(tokens);
    const effectiveTokens = withoutBrands.length > 0 ? withoutBrands : tokens;

    const joined = effectiveTokens.join(' ');
    const cleaned = joined.replace(/[-.]/g, '').replace(/\s+/g, '');

    return cleaned.toUpperCase() as ArticleNumber;
  }

  /**
   * Aggressive normalisation (research.md §10): runs standard normalisation,
   * then strips all remaining non-alphanumeric characters (slashes, commas,
   * parentheses, etc.). Returns null when the result is identical to standard
   * normalisation — the caller should skip the aggressive-tier fallback in
   * that case since it would produce the same TecDoc query.
   */
  aggressiveNormalise(input: string): ArticleNumber | null {
    const standard = this.normalise(input);
    const aggressive = standard.replace(/[^A-Z0-9]/g, '') as ArticleNumber;
    return aggressive !== standard ? aggressive : null;
  }

  private stripBrandTokens(tokens: string[]): string[] {
    const upperTokens = tokens.map((token) => token.toUpperCase());
    const result: string[] = [];

    let index = 0;
    while (index < tokens.length) {
      const matchLength = this.matchingBrandLength(upperTokens, index);
      if (matchLength > 0) {
        index += matchLength;
      } else {
        result.push(tokens[index]);
        index += 1;
      }
    }

    return result;
  }

  private matchingBrandLength(upperTokens: string[], index: number): number {
    for (const sequence of this.brandTokenSequences) {
      const candidate = upperTokens.slice(index, index + sequence.length);
      if (
        candidate.length === sequence.length &&
        sequence.every((token, offset) => token === candidate[offset])
      ) {
        return sequence.length;
      }
    }
    return 0;
  }
}
