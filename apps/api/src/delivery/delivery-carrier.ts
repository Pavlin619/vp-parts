import type { DeliveryOfficeDto, ShippingMethod } from '@vp-parts-shop/shared';
import type { LockerLimits } from './parcel/locker-fit';
import type { Parcel } from './parcel/parcel-estimate';

export const DELIVERY_CARRIERS = 'DELIVERY_CARRIERS';

export interface CarrierQuote {
  priceIncVatCents: number;
  expectedDeliveryDate: string | null;
}

/** One courier behind the delivery routes. Each is registered under {@link DELIVERY_CARRIERS}. */
export interface DeliveryCarrier {
  readonly carrier: ShippingMethod;
  /** The largest locker cell; null when the carrier has no lockers. */
  readonly lockerLimits: LockerLimits | null;
  listOffices(): Promise<DeliveryOfficeDto[]>;
  findOffice(code: string): Promise<DeliveryOfficeDto | undefined>;
  /** `sendDate` is the shop-local day we hand the parcel over; null lets the carrier assume today. */
  quote(
    officeCode: string,
    parcel: Parcel,
    sendDate: string | null,
  ): Promise<CarrierQuote>;
}
