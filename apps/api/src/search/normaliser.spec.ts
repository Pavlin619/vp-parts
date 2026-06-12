import { ConfigService } from '@nestjs/config';
import { PartNumberNormaliser } from './normaliser';

function createNormaliser(brandDictionary?: string): PartNumberNormaliser {
  const config = {
    get: jest.fn().mockReturnValue(brandDictionary),
  } as unknown as ConfigService;
  return new PartNumberNormaliser(config);
}

describe('PartNumberNormaliser', () => {
  let normaliser: PartNumberNormaliser;

  beforeEach(() => {
    normaliser = createNormaliser();
  });

  describe('pipeline steps', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normaliser.normalise('  WL6340  ')).toBe('WL6340');
    });

    it('strips a known brand token', () => {
      expect(normaliser.normalise('WL6340 WIX')).toBe('WL6340');
    });

    it('strips brand tokens case-insensitively', () => {
      expect(normaliser.normalise('wl6340 wix')).toBe('WL6340');
    });

    it('strips a brand token appearing before the number', () => {
      expect(normaliser.normalise('BOSCH 0986478451')).toBe('0986478451');
    });

    it('strips multi-word brand names as a token sequence', () => {
      expect(normaliser.normalise('JV1522 LIQUI MOLY')).toBe('JV1522');
    });

    it('removes all hyphens', () => {
      expect(normaliser.normalise('wl-6340')).toBe('WL6340');
    });

    it('removes all dots', () => {
      expect(normaliser.normalise('06J.115.403.Q')).toBe('06J115403Q');
    });

    it('removes internal spaces', () => {
      expect(normaliser.normalise('06J 115 403 Q')).toBe('06J115403Q');
    });

    it('converts to uppercase', () => {
      expect(normaliser.normalise('wl6340')).toBe('WL6340');
    });

    it('handles all messy-input patterns combined', () => {
      expect(normaliser.normalise('  wl-63.40 WIX ')).toBe('WL6340');
    });
  });

  describe('brand-only input', () => {
    it('falls back to the raw input when stripping would leave nothing', () => {
      expect(normaliser.normalise('BOSCH')).toBe('BOSCH');
    });
  });

  describe('aggressiveNormalise', () => {
    it('returns null when the input contains no extra special characters', () => {
      expect(normaliser.aggressiveNormalise('WL6340')).toBeNull();
    });

    it('returns null after standard normalisation already produces a clean result', () => {
      expect(normaliser.aggressiveNormalise('wl-6340 WIX')).toBeNull();
    });

    it('strips slashes that survive standard normalisation', () => {
      expect(normaliser.aggressiveNormalise('06J/115/403Q')).toBe('06J115403Q');
    });

    it('strips parentheses that survive standard normalisation', () => {
      expect(normaliser.aggressiveNormalise('BP(WA6546)')).toBe('BPWA6546');
    });

    it('strips colons and semicolons that survive standard normalisation', () => {
      expect(normaliser.aggressiveNormalise('A:123;B')).toBe('A123B');
    });

    it('returns null when aggressive form equals standard form', () => {
      expect(normaliser.aggressiveNormalise('WL6340-WIX')).toBeNull();
    });
  });

  describe('configurable brand dictionary', () => {
    it('strips brands from the configured dictionary', () => {
      const custom = createNormaliser('ACME,FOO BAR');
      expect(custom.normalise('X123 ACME')).toBe('X123');
    });

    it('strips configured multi-word brands', () => {
      const custom = createNormaliser('ACME,FOO BAR');
      expect(custom.normalise('X123 FOO BAR')).toBe('X123');
    });

    it('does not strip default brands when a custom dictionary is set', () => {
      const custom = createNormaliser('ACME');
      expect(custom.normalise('X123 WIX')).toBe('X123WIX');
    });

    it('reads the dictionary from the SEARCH_BRAND_DICTIONARY config key', () => {
      const get = jest.fn().mockReturnValue(undefined);
      new PartNumberNormaliser({ get } as unknown as ConfigService);
      expect(get).toHaveBeenCalledWith('SEARCH_BRAND_DICTIONARY');
    });
  });
});
