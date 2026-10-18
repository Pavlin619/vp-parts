import { ValidationPipe } from '@nestjs/common';
import { DeliveryMethod } from '@vp-parts-shop/shared';
import {
  CourierAddressDeliveryBodyDto,
  CourierOfficeDeliveryBodyDto,
  OrderReferenceParamsDto,
  PlaceOrderBodyDto,
  StorePickupDeliveryBodyDto,
} from './orders.dto';

describe('PlaceOrderBodyDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transform = (value: object) =>
    pipe.transform(value, { type: 'body', metatype: PlaceOrderBodyDto });

  const BODY = {
    cartId: '7b0c2f4e-35a4-4f43-8f4c-6d1b1d3c2a10',
    cartVersion: 7,
    expectedTotalCents: 5304,
    paymentMethod: 'CASH_ON_DELIVERY',
    delivery: {
      method: 'COURIER_OFFICE',
      carrier: 'ECONT',
      officeCode: '1127',
    },
  };

  it('accepts an office delivery', async () => {
    const dto = (await transform(BODY)) as PlaceOrderBodyDto;

    expect(dto.delivery).toBeInstanceOf(CourierOfficeDeliveryBodyDto);
  });

  it('accepts an address delivery, validated as an address', async () => {
    const dto = (await transform({
      ...BODY,
      delivery: {
        method: 'COURIER_ADDRESS',
        carrier: 'ECONT',
        address: { placeId: '41', street: 'бул. Витоша', streetNumber: '10' },
      },
    })) as PlaceOrderBodyDto;

    expect(dto.delivery).toBeInstanceOf(CourierAddressDeliveryBodyDto);
  });

  it('accepts store pickup', async () => {
    const dto = (await transform({
      ...BODY,
      delivery: { method: DeliveryMethod.STORE_PICKUP },
    })) as PlaceOrderBodyDto;

    expect(dto.delivery).toBeInstanceOf(StorePickupDeliveryBodyDto);
  });

  it('refuses an address that does not locate a door', async () => {
    await expect(
      transform({
        ...BODY,
        delivery: {
          method: 'COURIER_ADDRESS',
          carrier: 'ECONT',
          address: { placeId: '41', street: 'бул. Витоша' },
        },
      }),
    ).rejects.toThrow();
  });

  it.each([
    ['card, which is not offered yet', { paymentMethod: 'CARD' }],
    ['a cart id that is not one', { cartId: 'cart-1' }],
    ['a fractional total', { expectedTotalCents: 53.04 }],
    ['a negative version', { cartVersion: -1 }],
    [
      'a carrier we do not ship with',
      { delivery: { ...BODY.delivery, carrier: 'SPEEDY' } },
    ],
    ['an unknown delivery method', { delivery: { method: 'DRONE' } }],
    ['the lines themselves', { lines: [{ articleNumber: 'X', price: 1 }] }],
  ])('refuses %s', async (_case, change) => {
    await expect(transform({ ...BODY, ...change })).rejects.toThrow();
  });
});

describe('OrderReferenceParamsDto', () => {
  const pipe = new ValidationPipe({ transform: true });

  const transform = (orderReference: string) =>
    pipe.transform(
      { orderReference },
      { type: 'param', metatype: OrderReferenceParamsDto },
    );

  it.each(['VP-ORD-000123', 'VP-ORD-1000000'])(
    'accepts %s',
    async (reference) => {
      await expect(transform(reference)).resolves.toEqual({
        orderReference: reference,
      });
    },
  );

  it.each([
    ['the order id', '7b0c2f4e-35a4-4f43-8f4c-6d1b1d3c2a10'],
    ['a reference without the order prefix', 'VP-000123'],
    ['a reference cut short', 'VP-ORD-123'],
    ['a lower-case reference', 'vp-ord-000123'],
  ])('refuses %s', async (_case, reference) => {
    await expect(transform(reference)).rejects.toThrow();
  });
});
