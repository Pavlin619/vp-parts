import { CustomerRole } from '@vp-parts-shop/shared';
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
  };

  it('maps a customer to their profile', () => {
    expect(toCustomerProfileDto(CUSTOMER)).toEqual({
      id: 'customer-1',
      email: 'ivan@example.com',
      firstName: 'Иван',
      lastName: 'Петров',
      phoneNumber: '+359888123456',
      role: CustomerRole.CUSTOMER,
      createdAt: '2026-10-11T08:00:00.000Z',
    });
  });
});
