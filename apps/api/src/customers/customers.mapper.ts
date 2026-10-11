import { CustomerProfileDto, CustomerRole } from '@vp-parts-shop/shared';
import type { CustomerProfileRecord } from './customers.repository';

export function toCustomerProfileDto(
  customer: CustomerProfileRecord,
): CustomerProfileDto {
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phoneNumber: customer.phoneNumber,
    role: CustomerRole[customer.role],
    createdAt: customer.createdAt.toISOString(),
  };
}
