import { shopDateOf } from './shop-date';

describe('shopDateOf', () => {
  it('names the Bulgarian calendar day of an instant', () => {
    expect(shopDateOf('2026-09-24T21:00:00Z')).toBe('2026-09-25');
  });

  it('keeps an instant late in the Bulgarian day on that day', () => {
    expect(shopDateOf('2026-09-25T20:59:59Z')).toBe('2026-09-25');
  });

  it('reads an epoch in milliseconds the same way', () => {
    expect(shopDateOf(new Date('2026-12-31T22:30:00Z').getTime())).toBe(
      '2027-01-01',
    );
  });
});
