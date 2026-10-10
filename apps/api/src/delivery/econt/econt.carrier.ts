import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryAddressDto,
  DeliveryAddressValidationDto,
  DeliveryDestinationDto,
  DeliveryOfficeDto,
  DeliveryPlaceDto,
  DeliveryQuarterDto,
  DeliveryStreetDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { CarrierQuote, DeliveryCarrier } from '../delivery-carrier';
import type { LockerLimits } from '../parcel/locker-fit';
import type { Parcel } from '../parcel/parcel-estimate';
import { EcontAddresses } from './econt-addresses';
import { EcontOffices } from './econt-offices';
import { EcontPlaces } from './econt-places';
import { EcontQuotes } from './econt-quotes';

@Injectable()
export class EcontCarrier implements DeliveryCarrier {
  readonly carrier = ShippingMethod.ECONT;
  readonly lockerLimits: LockerLimits;

  constructor(
    private readonly offices: EcontOffices,
    private readonly places: EcontPlaces,
    private readonly quotes: EcontQuotes,
    private readonly addresses: EcontAddresses,
    config: ConfigService,
  ) {
    this.lockerLimits = econtomatLimitsFrom(config);
  }

  listOffices(): Promise<DeliveryOfficeDto[]> {
    return this.offices.list();
  }

  findOffice(code: string): Promise<DeliveryOfficeDto | undefined> {
    return this.offices.find(code);
  }

  listPlaces(): Promise<DeliveryPlaceDto[]> {
    return this.places.list();
  }

  listAddressPlaces(): Promise<DeliveryPlaceDto[]> {
    return this.places.listForAddress();
  }

  findStreets(placeId: string, query: string): Promise<DeliveryStreetDto[]> {
    return this.addresses.streets(placeId, query);
  }

  findQuarters(placeId: string, query: string): Promise<DeliveryQuarterDto[]> {
    return this.addresses.quarters(placeId, query);
  }

  validateAddress(
    address: DeliveryAddressDto,
  ): Promise<DeliveryAddressValidationDto> {
    return this.addresses.validate(address);
  }

  quote(
    destination: DeliveryDestinationDto,
    parcel: Parcel,
    sendDate: string | null,
  ): Promise<CarrierQuote> {
    return this.quotes.quote(destination, parcel, sendDate);
  }
}

function econtomatLimitsFrom(config: ConfigService): LockerLimits {
  const [length, width, height] = config
    .get<string>('ECONT_LOCKER_MAX_CM')!
    .split(',')
    .map(Number);

  return {
    maxSidesCm: [length, width, height],
    maxWeightGrams: Number(config.get('ECONT_LOCKER_MAX_WEIGHT_GRAMS')),
    fillFactor: Number(config.get('ECONT_LOCKER_FILL_FACTOR')),
  };
}
