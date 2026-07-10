import { BrandDto } from '@vp-parts-shop/shared';
import { buildBrandTokenSet, isBrandToken } from './brand-dictionary';

const brand = (brandName: string): BrandDto => ({ brandName, logoUrl: null });

describe('brand-dictionary', () => {
  describe('buildBrandTokenSet', () => {
    it('extracts the distinctive word from a multi-word brand name', () => {
      const tokens = buildBrandTokenSet([brand('WIX Filters')]);

      expect(tokens.has('WIX')).toBe(true);
      // "FILTERS" is a generic word and must not become a strippable token.
      expect(tokens.has('FILTERS')).toBe(false);
    });

    it('splits hyphenated brand names and drops the generic part', () => {
      const tokens = buildBrandTokenSet([brand('MANN-FILTER')]);

      expect(tokens.has('MANN')).toBe(true);
      expect(tokens.has('FILTER')).toBe(false);
    });

    it('keeps every distinctive word of a multi-word brand', () => {
      const tokens = buildBrandTokenSet([brand('LIQUI MOLY')]);

      expect(tokens.has('LIQUI')).toBe(true);
      expect(tokens.has('MOLY')).toBe(true);
    });

    it('excludes tokens shorter than three characters and purely numeric tokens', () => {
      const tokens = buildBrandTokenSet([brand('X1 42')]);

      expect(tokens.has('X1')).toBe(false);
      expect(tokens.has('42')).toBe(false);
    });

    it('always includes the configured aliases', () => {
      const tokens = buildBrandTokenSet([]);

      expect(tokens.has('ZF')).toBe(true);
    });
  });

  describe('isBrandToken', () => {
    it('matches case-insensitively', () => {
      const tokens = buildBrandTokenSet([brand('Bosch')]);

      expect(isBrandToken('bosch', tokens)).toBe(true);
      expect(isBrandToken('BOSCH', tokens)).toBe(true);
      expect(isBrandToken('WA5432', tokens)).toBe(false);
    });
  });
});
