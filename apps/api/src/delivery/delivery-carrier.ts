import type {
  DeliveryAddressDto,
  DeliveryAddressValidationDto,
  DeliveryDestinationDto,
  DeliveryOfficeDto,
  DeliveryPlaceDto,
  DeliveryQuarterDto,
  DeliveryStreetDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { LockerLimits } from './parcel/locker-fit';
import type { Parcel } from './parcel/parcel-estimate';

export const DELIVERY_CARRIERS = 'DELIVERY_CARRIERS';

export interface Shipment {
  parcel: Parcel;
  /** The shop-local day the parcel is handed to the courier; null lets the carrier assume today. */
  sendDate: string | null;
  /** What the courier collects from the customer at the door; null when it collects nothing. */
  cashOnDeliveryCents: number | null;
}

export interface CarrierQuote {
  /** The delivery alone, without the cash-on-delivery fee. */
  priceIncVatCents: number;
  /** Null when the courier collects nothing. */
  cashOnDeliveryFeeIncVatCents: number | null;
  expectedDeliveryDate: string | null;
}

/** One courier behind the delivery routes. Each is registered under {@link DELIVERY_CARRIERS}. */
export interface DeliveryCarrier {
  readonly carrier: ShippingMethod;
  /** The largest locker cell; null when the carrier has no lockers. */
  readonly lockerLimits: LockerLimits | null;
  listOffices(): Promise<DeliveryOfficeDto[]>;
  findOffice(code: string): Promise<DeliveryOfficeDto | undefined>;
  listPlaces(): Promise<DeliveryPlaceDto[]>;
  /** The places a courier delivers to, which is not the places an office can be collected in. */
  listAddressPlaces(): Promise<DeliveryPlaceDto[]>;
  findStreets(placeId: string, query: string): Promise<DeliveryStreetDto[]>;
  findQuarters(placeId: string, query: string): Promise<DeliveryQuarterDto[]>;
  validateAddress(
    address: DeliveryAddressDto,
  ): Promise<DeliveryAddressValidationDto>;
  quote(
    destination: DeliveryDestinationDto,
    shipment: Shipment,
  ): Promise<CarrierQuote>;
}
