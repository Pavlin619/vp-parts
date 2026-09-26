import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryOfficeDto, ShippingMethod } from '@vp-parts-shop/shared';
import type { CarrierQuote, DeliveryCarrier } from '../delivery-carrier';
import type { LockerLimits } from '../parcel/locker-fit';
import type { Parcel } from '../parcel/parcel-estimate';
import { EcontOffices } from './econt-offices';
import { EcontQuotes } from './econt-quotes';

@Injectable()
export class EcontCarrier implements DeliveryCarrier {
  readonly carrier = ShippingMethod.ECONT;
  readonly lockerLimits: LockerLimits;

  constructor(
    private readonly offices: EcontOffices,
    private readonly quotes: EcontQuotes,
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

  quote(
    officeCode: string,
    parcel: Parcel,
    sendDate: string | null,
  ): Promise<CarrierQuote> {
    return this.quotes.quote(officeCode, parcel, sendDate);
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
