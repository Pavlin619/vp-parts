import { CustomerRole, MechanicApprovalStatus } from '../enums';

export interface CustomerProfileDto {
  id: string;
  email: string;
  /** Null until given: a Google account need not have a last name and never has a phone. */
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
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
