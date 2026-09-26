import { ShippingMethod } from '../enums';
import { ArticleIdentityDto } from './inventory.dto';

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
  city: string;
  postCode: string | null;
  address: string;
  latitude: number;
  longitude: number;
  type: DeliveryOfficeType;
  weekdayHours: DeliveryOfficeHoursDto | null;
  saturdayHours: DeliveryOfficeHoursDto | null;
}

/** What the selected cart lines weigh as one parcel, and whether the asked carrier's locker takes it. */
export interface ParcelEstimateDto {
  /**
   * Null when any selected part has no known weight. Delivery then cannot be quoted:
   * the shop measures the part and calls the customer with the price.
   */
  weightGrams: number | null;
  /** The selected parts with no known weight; empty exactly when `weightGrams` is set. */
  unmeasuredArticles: ArticleIdentityDto[];
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
