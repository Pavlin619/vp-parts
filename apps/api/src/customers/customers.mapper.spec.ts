import { CustomerRole, ShippingMethod } from '@vp-parts-shop/shared';
import { toCustomerProfileDto } from './customers.mapper';
import type { CustomerProfileRecord } from './customers.repository';

describe('toCustomerProfileDto', () => {
  const CUSTOMER: CustomerProfileRecord = {
    id: 'customer-1',
    email: 'ivan@example.com',
    firstName: 'Иван',
    lastName: 'Петров',
    phoneNumber: '+359888123456',
    role: 'CUSTOMER',
    createdAt: new Date('2026-10-11T08:00:00.000Z'),
    addresses: [],
  };

  const ADDRESS = {
    id: 'address-1',
    carrier: 'ECONT' as const,
    placeId: '41',
    city: 'София',
    postCode: '1000',
    street: 'бул. Витоша',
    streetNumber: '60',
    quarter: null,
    block: null,
    entrance: null,
    floor: null,
    apartment: null,
    note: null,
  };

  it('maps a customer without an address', () => {
    expect(toCustomerProfileDto(CUSTOMER)).toEqual({
      id: 'customer-1',
      email: 'ivan@example.com',
      firstName: 'Иван',
      lastName: 'Петров',
      phoneNumber: '+359888123456',
      role: CustomerRole.CUSTOMER,
      createdAt: '2026-10-11T08:00:00.000Z',
      defaultAddress: null,
    });
  });

  it('leaves out the parts of an address that were never filled', () => {
    const profile = toCustomerProfileDto({ ...CUSTOMER, addresses: [ADDRESS] });

    expect(profile.defaultAddress).toEqual({
      id: 'address-1',
      carrier: ShippingMethod.ECONT,
      placeId: '41',
      city: 'София',
      postCode: '1000',
      street: 'бул. Витоша',
      streetNumber: '60',
    });
  });
});
