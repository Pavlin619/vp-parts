import {
  CustomerAddressDto,
  CustomerProfileDto,
  CustomerRole,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { CustomerProfileRecord } from './customers.repository';

type AddressRecord = CustomerProfileRecord['addresses'][number];

export function toCustomerProfileDto(
  customer: CustomerProfileRecord,
): CustomerProfileDto {
  const [defaultAddress] = customer.addresses;

  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phoneNumber: customer.phoneNumber,
    role: CustomerRole[customer.role],
    createdAt: customer.createdAt.toISOString(),
    defaultAddress: defaultAddress
      ? toCustomerAddressDto(defaultAddress)
      : null,
  };
}

function toCustomerAddressDto({
  id,
  carrier,
  placeId,
  city,
  postCode,
  ...parts
}: AddressRecord): CustomerAddressDto {
  const filledParts = Object.fromEntries(
    Object.entries(parts).filter(([, value]) => value !== null),
  );

  return {
    id,
    carrier: ShippingMethod[carrier],
    placeId,
    city,
    postCode,
    ...filledParts,
  };
}
