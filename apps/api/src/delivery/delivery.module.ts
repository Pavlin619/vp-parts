import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { InventoryModule } from '../inventory';
import { RedisModule } from '../redis';
import { DELIVERY_CARRIERS } from './delivery-carrier';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { EcontOffices } from './econt/econt-offices';
import { EcontQuotes } from './econt/econt-quotes';
import { EcontCarrier } from './econt/econt.carrier';
import { EcontTransport } from './econt/econt.transport';

/** Courier offices, parcel estimates and delivery quotes. See docs/DELIVERY-PROVIDERS.md. */
@Module({
  imports: [CartModule, InventoryModule, RedisModule],
  controllers: [DeliveryController],
  providers: [
    DeliveryService,
    EcontTransport,
    EcontOffices,
    EcontQuotes,
    EcontCarrier,
    {
      provide: DELIVERY_CARRIERS,
      useFactory: (econt: EcontCarrier) => [econt],
      inject: [EcontCarrier],
    },
  ],
})
export class DeliveryModule {}
