import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { OrderAccessKeys } from './order-access-keys';

const SECRET = 's'.repeat(32);

async function keysWith(secret: string): Promise<OrderAccessKeys> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      OrderAccessKeys,
      { provide: ConfigService, useValue: { get: () => secret } },
    ],
  }).compile();

  return moduleRef.get(OrderAccessKeys);
}

describe('OrderAccessKeys', () => {
  let keys: OrderAccessKeys;

  beforeEach(async () => {
    keys = await keysWith(SECRET);
  });

  it('derives the key as an HMAC of the order id, in base64url', () => {
    const expected = createHmac('sha256', SECRET)
      .update('order-1')
      .digest('base64url');

    expect(keys.keyFor('order-1')).toBe(expected);
    expect(keys.keyFor('order-1')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('gives each order its own key, the same every time', () => {
    expect(keys.keyFor('order-1')).toBe(keys.keyFor('order-1'));
    expect(keys.keyFor('order-1')).not.toBe(keys.keyFor('order-2'));
  });

  it('gives another secret other keys', async () => {
    const other = await keysWith('t'.repeat(32));

    expect(other.keyFor('order-1')).not.toBe(keys.keyFor('order-1'));
  });

  it('accepts only the order’s own key', () => {
    const key = keys.keyFor('order-1');

    expect(keys.matches('order-1', key)).toBe(true);
    expect(keys.matches('order-2', key)).toBe(false);
  });

  it.each([
    ['no key', undefined],
    ['an empty key', ''],
    ['a key cut short', 'abc'],
    ['a key too long', 'a'.repeat(100)],
  ])('refuses %s', (_case, key) => {
    expect(keys.matches('order-1', key)).toBe(false);
  });

  describe('pagePathFor', () => {
    it('links a guest’s order with its key in the fragment', () => {
      expect(
        keys.pagePathFor({
          id: 'order-1',
          orderReference: 'VP-ORD-000042',
          customerId: null,
        }),
      ).toBe(`/orders/VP-ORD-000042#k=${keys.keyFor('order-1')}`);
    });

    it('links a customer’s order bare, to be read through the account', () => {
      expect(
        keys.pagePathFor({
          id: 'order-1',
          orderReference: 'VP-ORD-000042',
          customerId: 'customer-1',
        }),
      ).toBe('/orders/VP-ORD-000042');
    });
  });
});
