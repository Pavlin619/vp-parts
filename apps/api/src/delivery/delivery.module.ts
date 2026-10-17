import { Module } from '@nestjs/common';
import { RedisModule } from '../redis';
import { DELIVERY_CARRIERS } from './delivery-carrier';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { EcontAddresses } from './econt/econt-addresses';
import { EcontOffices } from './econt/econt-offices';
import { EcontPlaces } from './econt/econt-places';
import { EcontQuotes } from './econt/econt-quotes';
import { EcontCarrier } from './econt/econt.carrier';
import { EcontTransport } from './econt/econt.transport';

/** Couriers: their offices and places, and what a parcel costs to send. See docs/DELIVERY-PROVIDERS.md. */
@Module({
  imports: [RedisModule],
  controllers: [DeliveryController],
  providers: [
    DeliveryService,
    EcontTransport,
    EcontOffices,
    EcontPlaces,
    EcontQuotes,
    EcontAddresses,
    EcontCarrier,
    {
      provide: DELIVERY_CARRIERS,
      useFactory: (econt: EcontCarrier) => [econt],
      inject: [EcontCarrier],
    },
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
