import { ShippingMethod } from '../enums';

export enum DeliveryOfficeType {
  OFFICE = 'OFFICE',
  /** An unstaffed parcel locker (Econtomat). Only a parcel that fits a cell can go there. */
  LOCKER = 'LOCKER',
}

/** Opening hours as shop-local "HH:mm". */
export interface DeliveryOfficeHoursDto {
  opensAt: string;
  closesAt: string;
}

export interface DeliveryOfficeDto {
  carrier: ShippingMethod;
  code: string;
  name: string;
  /** The {@link DeliveryPlaceDto.id} of the settlement the office stands in. */
  placeId: string;
  city: string;
  postCode: string | null;
  address: string;
  latitude: number;
  longitude: number;
  type: DeliveryOfficeType;
  weekdayHours: DeliveryOfficeHoursDto | null;
  saturdayHours: DeliveryOfficeHoursDto | null;
}

/**
 * A settlement a customer can collect a parcel for: one with an office of its own, or
 * a village the carrier serves from an office elsewhere. Places have no coordinates.
 */
export interface DeliveryPlaceDto {
  carrier: ShippingMethod;
  /** The carrier's own id; two places can share a name, even within one region. */
  id: string;
  name: string;
  /** Named as customers know it ("София-град"), not as the carrier files it. */
  region: string;
  postCode: string;
  /** Where a place with no office of its own collects its parcels; null when it has one. */
  servingOfficeCode: string | null;
}

/** What the selected cart lines weigh as one parcel, and whether the asked carrier's locker takes it. */
export interface ParcelEstimateDto {
  weightGrams: number;
  isLockerEligible: boolean;
}

export interface DeliveryQuoteRequestDto {
  carrier: ShippingMethod;
  officeCode: string;
}

export interface DeliveryQuoteDto {
  carrier: ShippingMethod;
  officeCode: string;
  priceIncVatCents: number;
  /** Shop-local `YYYY-MM-DD` the carrier expects to deliver on, when it gives one. */
  expectedDeliveryDate: string | null;
  parcel: ParcelEstimateDto;
  /** The cart version this quote priced; an order for a different version must re-quote. */
  cartVersion: number;
}
