import { CustomerRole, MechanicApprovalStatus, ShippingMethod } from '../enums';
import type { DeliveryAddressDto } from './delivery.dto';

export interface CustomerProfileDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: CustomerRole;
  createdAt: string;
  mechanicProfile?: MechanicProfileDto;
  defaultAddress: CustomerAddressDto | null;
}

export interface MechanicProfileDto {
  status: MechanicApprovalStatus;
  businessName: string;
  eik: string;
  vatNumber: string | null;
  businessAddress: string;
  businessPhone: string;
  appliedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

/**
 * An address a customer keeps on file. Tied to one carrier, because `placeId`
 * is that carrier's settlement id; `city` and `postCode` are kept for display.
 */
export interface CustomerAddressInputDto extends DeliveryAddressDto {
  carrier: ShippingMethod;
  city: string;
  postCode: string;
}

export interface CustomerAddressDto extends CustomerAddressInputDto {
  id: string;
}

/**
 * Completes a Clerk sign-up into a customer. Email and names are read from
 * Clerk by the API, never taken from this body.
 */
export interface CreateCustomerRequestDto {
  phoneNumber: string;
  address?: CustomerAddressInputDto;
}

export interface SavedVehicleDto {
  id: string;
  tecdocVehicleId: string;
  manufacturer: string;
  modelSeries: string;
  variant: string;
  addedAt: string;
}

export interface MechanicApproveRequestDto {
  approvedBy: string;
}

export interface MechanicRejectRequestDto {
  rejectedBy: string;
  reason: string;
}
