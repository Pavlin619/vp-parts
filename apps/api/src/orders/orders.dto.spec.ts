import { ValidationPipe } from '@nestjs/common';
import { DeliveryMethod } from '@vp-parts-shop/shared';
import {
  CourierAddressDeliveryBodyDto,
  CourierOfficeDeliveryBodyDto,
  OrderReferenceParamsDto,
  PlaceOrderBodyDto,
  QuickOrderBodyDto,
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

  it('accepts card', async () => {
    const dto = (await transform({
      ...BODY,
      paymentMethod: 'CARD',
    })) as PlaceOrderBodyDto;

    expect(dto.paymentMethod).toBe('CARD');
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
    ['a payment method we do not take', { paymentMethod: 'BANK_TRANSFER' }],
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

describe('QuickOrderBodyDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transform = (value: object) =>
    pipe.transform(value, { type: 'body', metatype: QuickOrderBodyDto });

  const CONTACT = {
    firstName: 'Мария',
    lastName: 'Иванова',
    phoneNumber: '0888 123 456',
  };

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
    contact: CONTACT,
    botCheckToken: '0.solved-turnstile-token',
  };

  it('accepts a name and a phone, storing the phone in E.164', async () => {
    const dto = (await transform(BODY)) as QuickOrderBodyDto;

    expect(dto.delivery).toBeInstanceOf(CourierOfficeDeliveryBodyDto);
    expect(dto.contact).toEqual({
      firstName: 'Мария',
      lastName: 'Иванова',
      phoneNumber: '+359888123456',
    });
  });

  it('trims the names and the email it is given', async () => {
    const dto = (await transform({
      ...BODY,
      contact: {
        ...CONTACT,
        firstName: ' Мария ',
        lastName: 'Иванова  ',
        email: ' maria@example.com ',
      },
    })) as QuickOrderBodyDto;

    expect(dto.contact).toMatchObject({
      firstName: 'Мария',
      lastName: 'Иванова',
      email: 'maria@example.com',
    });
  });

  it.each([
    ['no contact', { contact: undefined }],
    ['a landline', { contact: { ...CONTACT, phoneNumber: '02 987 6543' } }],
    ['no last name', { contact: { ...CONTACT, lastName: undefined } }],
    ['a name with digits', { contact: { ...CONTACT, firstName: 'Мария2' } }],
    ['an email that is not one', { contact: { ...CONTACT, email: 'maria@' } }],
    ['an empty email', { contact: { ...CONTACT, email: '' } }],
    ['a contact field of its own', { contact: { ...CONTACT, note: 'x' } }],
    ['card, which a guest cannot pay with', { paymentMethod: 'CARD' }],
    ['no bot check token', { botCheckToken: undefined }],
    ['an empty bot check token', { botCheckToken: '' }],
    [
      'a bot check token longer than Turnstile issues',
      { botCheckToken: 'x'.repeat(2049) },
    ],
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
