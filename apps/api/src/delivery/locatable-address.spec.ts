import { isLocatableAddress } from '@vp-parts-shop/shared';

describe('isLocatableAddress', () => {
  it('accepts a street with its number', () => {
    expect(
      isLocatableAddress({ street: 'бул. Витоша', streetNumber: '60' }),
    ).toBe(true);
  });

  it('rejects a street without its number', () => {
    expect(isLocatableAddress({ street: 'бул. Витоша' })).toBe(false);
  });

  it.each(['block', 'entrance', 'floor', 'apartment'] as const)(
    'accepts a quarter with its %s',
    (part) => {
      expect(
        isLocatableAddress({ quarter: 'кв. Младост-1', [part]: '5' }),
      ).toBe(true);
    },
  );

  it('rejects a quarter alone, or with only a note, which locates nothing', () => {
    expect(isLocatableAddress({ quarter: 'кв. Младост-1' })).toBe(false);
    expect(isLocatableAddress({ quarter: 'кв. Младост-1', note: 'x' })).toBe(
      false,
    );
  });

  it('rejects a block without a quarter', () => {
    expect(isLocatableAddress({ block: '5' })).toBe(false);
  });
});
