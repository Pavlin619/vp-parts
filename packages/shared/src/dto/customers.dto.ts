import { CustomerRole, MechanicApprovalStatus } from '../enums.js';

export interface CustomerProfileDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: CustomerRole;
  createdAt: string;
  mechanicProfile?: MechanicProfileDto;
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

export interface AddressDto {
  id: string;
  fullName: string;
  city: string;
  postcode: string;
  street: string;
  streetNumber: string;
  apartment: string | null;
  phoneNumber: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
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
