import { CartLineDto, MAX_CART_LINES } from '@vp-parts-shop/shared';
import { mergeCartLines } from './cart-merge';

function line(overrides: Partial<CartLineDto> = {}): CartLineDto {
  return {
    brandId: '30',
    articleNumber: '0986479061',
    brandName: 'BOSCH',
    brandLogoUrl: null,
    description: 'Спирачен диск',
    thumbnailUrl: null,
    quantity: 1,
    isSelected: true,
    addedAtPriceIncVat: 4500,
    addedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('mergeCartLines', () => {
  it('keeps the existing lines when nothing comes in', () => {
    const existing = [line()];

    const { lines, dropped } = mergeCartLines(existing, []);

    expect(lines).toEqual(existing);
    expect(dropped).toEqual([]);
  });

  it('appends an incoming line the existing cart does not hold', () => {
    const { lines, dropped } = mergeCartLines(
      [line()],
      [line({ brandId: '77', articleNumber: 'OC90' })],
    );

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ brandId: '77', articleNumber: 'OC90' });
    expect(dropped).toEqual([]);
  });

  it('sums the quantity of a line both carts hold', () => {
    const { lines } = mergeCartLines(
      [line({ quantity: 2 })],
      [line({ quantity: 3 })],
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
  });

  it('clamps a summed quantity to the line ceiling', () => {
    const { lines } = mergeCartLines(
      [line({ quantity: 90 })],
      [line({ quantity: 50 })],
    );

    expect(lines[0].quantity).toBe(99);
  });

  it('treats the same number under two brands as two parts', () => {
    const { lines } = mergeCartLines(
      [line({ brandId: '30', quantity: 2 })],
      [line({ brandId: '77', quantity: 3 })],
    );

    expect(lines).toHaveLength(2);
    expect(lines.map((merged) => merged.quantity)).toEqual([2, 3]);
  });

  it('selects a merged line when either side wanted it ordered', () => {
    const { lines } = mergeCartLines(
      [line({ isSelected: false })],
      [line({ isSelected: true })],
    );

    expect(lines[0].isSelected).toBe(true);
  });

  it("keeps the older line's reference price when the existing side is older", () => {
    const { lines } = mergeCartLines(
      [line({ addedAtPriceIncVat: 4500, addedAt: '2026-08-01T00:00:00.000Z' })],
      [line({ addedAtPriceIncVat: 5900, addedAt: '2026-09-01T00:00:00.000Z' })],
    );

    expect(lines[0].addedAtPriceIncVat).toBe(4500);
    expect(lines[0].addedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  // A guest cart is very often the older one: the guest cart existed first,
  // and the account cart is what the customer only just started filling.
  it("keeps the older line's reference price even when the incoming side is older", () => {
    const { lines } = mergeCartLines(
      [line({ addedAtPriceIncVat: 5900, addedAt: '2026-09-01T00:00:00.000Z' })],
      [line({ addedAtPriceIncVat: 4500, addedAt: '2026-08-01T00:00:00.000Z' })],
    );

    expect(lines[0].addedAtPriceIncVat).toBe(4500);
    expect(lines[0].addedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('takes the incoming lines oldest-first when it cannot take them all', () => {
    const existing = Array.from({ length: MAX_CART_LINES - 1 }, (_, index) =>
      line({ articleNumber: `EXISTING-${index}` }),
    );
    const incoming = [
      line({ articleNumber: 'NEWER', addedAt: '2026-09-05T00:00:00.000Z' }),
      line({ articleNumber: 'OLDER', addedAt: '2026-09-01T00:00:00.000Z' }),
    ];

    const { lines, dropped } = mergeCartLines(existing, incoming);

    expect(lines).toHaveLength(MAX_CART_LINES);
    expect(lines[MAX_CART_LINES - 1].articleNumber).toBe('OLDER');
    expect(dropped).toEqual([{ brandId: '30', articleNumber: 'NEWER' }]);
  });

  it('still raises a matching line when the cart is already full', () => {
    const existing = Array.from({ length: MAX_CART_LINES }, (_, index) =>
      line({ articleNumber: `EXISTING-${index}`, quantity: 1 }),
    );

    const { lines, dropped } = mergeCartLines(existing, [
      line({ articleNumber: 'EXISTING-0', quantity: 4 }),
    ]);

    expect(lines).toHaveLength(MAX_CART_LINES);
    expect(lines[0].quantity).toBe(5);
    expect(dropped).toEqual([]);
  });
});
