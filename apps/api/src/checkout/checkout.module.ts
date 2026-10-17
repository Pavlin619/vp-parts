import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { DeliveryModule } from '../delivery';
import { InventoryModule } from '../inventory';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrderMoneyCalculator } from './order-money.calculator';

/** The cart priced with a delivery: what checkout shows and an order charges. See docs/ORDERS.md. */
@Module({
  imports: [CartModule, InventoryModule, DeliveryModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, OrderMoneyCalculator],
  exports: [CheckoutService],
})
export class CheckoutModule {}
