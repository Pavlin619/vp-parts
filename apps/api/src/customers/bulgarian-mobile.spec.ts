import { isBulgarianMobile, toBulgarianMobile } from '@vp-parts-shop/shared';

describe('toBulgarianMobile', () => {
  it.each([
    ['0888 123 456', '+359888123456'],
    ['0888123456', '+359888123456'],
    ['+359 88 812 3456', '+359888123456'],
    ['00359888123456', '+359888123456'],
    ['0888-123-456', '+359888123456'],
    ['(088) 812 3456', '+359888123456'],
    ['0878 123 456', '+359878123456'],
    ['0898 123 456', '+359898123456'],
    ['0988 123 456', '+359988123456'],
  ])('normalises %s to %s', (input, expected) => {
    expect(toBulgarianMobile(input)).toBe(expected);
  });

  it.each([
    ['a Sofia landline', '02 987 6543'],
    ['a landline written internationally', '+359 2 987 6543'],
    ['a number one digit short', '088 812 345'],
    ['a number one digit long', '0888 123 4567'],
    ['a prefix no operator holds', '0998 123 456'],
    ['a foreign mobile', '+44 7911 123456'],
    ['letters', 'not a phone'],
    ['nothing', ''],
  ])('rejects %s', (_case, input) => {
    expect(toBulgarianMobile(input)).toBeNull();
  });
});

describe('isBulgarianMobile', () => {
  it('agrees with toBulgarianMobile', () => {
    expect(isBulgarianMobile('0888 123 456')).toBe(true);
    expect(isBulgarianMobile('02 987 6543')).toBe(false);
  });
});
