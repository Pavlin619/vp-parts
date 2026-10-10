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

export enum DeliveryDestinationType {
  OFFICE = 'OFFICE',
  ADDRESS = 'ADDRESS',
}

/** Longest text each part of an address may hold; every carrier's address is built from these. */
export const DELIVERY_ADDRESS_LIMITS = {
  street: 200,
  streetNumber: 10,
  quarter: 100,
  block: 10,
  entrance: 10,
  floor: 10,
  apartment: 10,
  note: 100,
} as const;

/**
 * Where a parcel is delivered. Econt's rule: name a street and its number, or a
 * quarter and where in it ({@link isLocatableAddress}). Name, phone and postcode
 * belong to the order, not to the address a quote or a check is asked for.
 */
export interface DeliveryAddressDto {
  /** The {@link DeliveryPlaceDto.id} of the settlement; never its name. */
  placeId: string;
  street?: string;
  streetNumber?: string;
  quarter?: string;
  block?: string;
  entrance?: string;
  floor?: string;
  apartment?: string;
  /** What the customer tells the courier; it never locates the door. */
  note?: string;
}

export function isLocatableAddress({
  street,
  streetNumber,
  quarter,
  block,
  entrance,
  floor,
  apartment,
}: Omit<DeliveryAddressDto, 'placeId'>): boolean {
  const isFilled = (value: string | undefined) => Boolean(value?.trim());
  const isPlacedInQuarter = [block, entrance, floor, apartment].some(isFilled);

  return (
    (isFilled(street) && isFilled(streetNumber)) ||
    (isFilled(quarter) && isPlacedInQuarter)
  );
}

export type DeliveryDestinationDto =
  | { type: DeliveryDestinationType.OFFICE; officeCode: string }
  | { type: DeliveryDestinationType.ADDRESS; address: DeliveryAddressDto };

export enum DeliveryAddressValidationStatus {
  VALID = 'VALID',
  /** The carrier accepts the address but corrected the street or quarter. */
  UNCERTAIN = 'UNCERTAIN',
  INVALID = 'INVALID',
}

export interface DeliveryAddressValidationDto {
  status: DeliveryAddressValidationStatus;
  /** The carrier's corrected address; set only when the status is UNCERTAIN. */
  suggested: DeliveryAddressDto | null;
}

/** A street or quarter the carrier lists in a place, named as it files it ("бул. Витоша"). */
export interface DeliveryStreetDto {
  id: string;
  name: string;
}

export type DeliveryQuarterDto = DeliveryStreetDto;

export interface DeliveryQuoteRequestDto {
  carrier: ShippingMethod;
  destination: DeliveryDestinationDto;
}

export interface DeliveryQuoteDto {
  carrier: ShippingMethod;
  destination: DeliveryDestinationDto;
  priceIncVatCents: number;
  /** Shop-local `YYYY-MM-DD` the carrier expects to deliver on, when it gives one. */
  expectedDeliveryDate: string | null;
  parcel: ParcelEstimateDto;
  /** The cart version this quote priced; an order for a different version must re-quote. */
  cartVersion: number;
}
