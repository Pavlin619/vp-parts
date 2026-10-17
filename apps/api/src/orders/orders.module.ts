import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { CheckoutModule } from '../checkout';
import { CustomersModule } from '../customers';
import { PrismaModule } from '../prisma';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

/** Placing an order and reading it back. See docs/ORDERS.md. */
@Module({
  imports: [PrismaModule, CustomersModule, CartModule, CheckoutModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService],
})
export class OrdersModule {}
