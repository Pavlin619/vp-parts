import { ValidationPipe } from '@nestjs/common';
import { ShippingMethod } from '@vp-parts-shop/shared';
import { CreateCustomerBodyDto } from './customers.dto';

describe('CreateCustomerBodyDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transform = (value: object) =>
    pipe.transform(value, { type: 'body', metatype: CreateCustomerBodyDto });

  const ADDRESS = {
    carrier: ShippingMethod.ECONT,
    placeId: '41',
    city: 'София',
    postCode: '1000',
    street: 'бул. Витоша',
    streetNumber: '60',
  };

  it('accepts a phone alone, since the address is optional', async () => {
    await expect(
      transform({ phoneNumber: '0888 123 456' }),
    ).resolves.toMatchObject({ phoneNumber: '+359888123456' });
  });

  it('stores the phone in E.164 whatever way it was typed', async () => {
    const body = (await transform({
      phoneNumber: '+359 88 812-3456',
    })) as CreateCustomerBodyDto;

    expect(body.phoneNumber).toBe('+359888123456');
  });

  it('requires a phone', async () => {
    await expect(transform({})).rejects.toThrow();
  });

  it.each([
    ['a landline', '02 987 6543'],
    ['a foreign mobile', '+44 7911 123456'],
    ['a short number', '088 812 345'],
    ['not a string', 888123456],
  ])('refuses %s', async (_case, phoneNumber) => {
    await expect(transform({ phoneNumber })).rejects.toThrow();
  });

  it('accepts an address the carrier can locate', async () => {
    await expect(
      transform({ phoneNumber: '0888123456', address: ADDRESS }),
    ).resolves.toMatchObject({ address: ADDRESS });
  });

  it('refuses an address that names a street without its number', async () => {
    await expect(
      transform({
        phoneNumber: '0888123456',
        address: { ...ADDRESS, streetNumber: undefined },
      }),
    ).rejects.toThrow();
  });

  it('refuses an address for a carrier we do not ship with', async () => {
    await expect(
      transform({
        phoneNumber: '0888123456',
        address: { ...ADDRESS, carrier: ShippingMethod.SPEEDY },
      }),
    ).rejects.toThrow();
  });

  it('refuses a postcode that is not four digits', async () => {
    await expect(
      transform({
        phoneNumber: '0888123456',
        address: { ...ADDRESS, postCode: '100' },
      }),
    ).rejects.toThrow();
  });

  // Email and names come from Clerk; accepting them here would let a caller
  // file a customer under a name Clerk never saw.
  it.each(['email', 'firstName', 'lastName'])(
    'refuses %s in the body',
    async (field) => {
      await expect(
        transform({ phoneNumber: '0888123456', [field]: 'x' }),
      ).rejects.toThrow();
    },
  );
});
