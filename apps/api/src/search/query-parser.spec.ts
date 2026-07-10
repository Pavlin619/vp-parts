import { parseQuery } from './query-parser';

const BRAND_TOKENS = new Set(['WIX', 'BOSCH', 'MANN', 'LIQUI', 'MOLY']);

describe('parseQuery', () => {
  it('strips a trailing brand token and records it as the hint', () => {
    const result = parseQuery('WA5432 WIX', BRAND_TOKENS);

    expect(result).toEqual({
      raw: 'WA5432 WIX',
      brandStripped: 'WA5432',
      brandHint: 'WIX',
    });
  });

  it('strips a leading brand token', () => {
    const result = parseQuery('WIX WA5432', BRAND_TOKENS);

    expect(result.brandStripped).toBe('WA5432');
    expect(result.brandHint).toBe('WIX');
  });

  it('strips brand tokens at both ends', () => {
    const result = parseQuery('BOSCH WA5432 WIX', BRAND_TOKENS);

    expect(result.brandStripped).toBe('WA5432');
    expect(result.brandHint).toContain('BOSCH');
    expect(result.brandHint).toContain('WIX');
  });

  it('strips a multi-word brand', () => {
    const result = parseQuery('LIQUI MOLY 5W30', BRAND_TOKENS);

    expect(result.brandStripped).toBe('5W30');
  });

  it('never removes characters from inside a token', () => {
    const result = parseQuery('WL-6340/A WIX', BRAND_TOKENS);

    expect(result.brandStripped).toBe('WL-6340/A');
    expect(result.brandHint).toBe('WIX');
  });

  it('matches brand tokens case-insensitively', () => {
    const result = parseQuery('wa5432 wix', BRAND_TOKENS);

    expect(result.brandStripped).toBe('wa5432');
    expect(result.brandHint).toBe('wix');
  });

  it('leaves a single-token query untouched', () => {
    const result = parseQuery('WA5432', BRAND_TOKENS);

    expect(result).toEqual({ raw: 'WA5432', brandStripped: 'WA5432' });
  });

  it('does not strip a bare brand-only query', () => {
    const result = parseQuery('BOSCH', BRAND_TOKENS);

    expect(result).toEqual({ raw: 'BOSCH', brandStripped: 'BOSCH' });
  });

  it('keeps at least one non-brand token when both are brands', () => {
    const result = parseQuery('WIX BOSCH', BRAND_TOKENS);

    // Only the leading brand is stripped; a token must remain.
    expect(result.brandStripped).toBe('BOSCH');
    expect(result.brandHint).toBe('WIX');
  });

  it('returns the raw query when no brand token is present', () => {
    const result = parseQuery('06J 115 403 Q', BRAND_TOKENS);

    expect(result).toEqual({
      raw: '06J 115 403 Q',
      brandStripped: '06J 115 403 Q',
    });
  });

  it('trims surrounding whitespace', () => {
    const result = parseQuery('  WA5432 WIX  ', BRAND_TOKENS);

    expect(result.raw).toBe('WA5432 WIX');
    expect(result.brandStripped).toBe('WA5432');
  });
});
