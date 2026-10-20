import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { CheckoutModule } from '../checkout';
import { CustomersModule } from '../customers';
import { EmailModule } from '../email';
import { EventsModule } from '../events';
import { PrismaModule } from '../prisma';
import { OfficeNotificationHandler } from './emails/office-notification.handler';
import { OrderConfirmationHandler } from './emails/order-confirmation.handler';
import { OrderPlacedPublisher } from './order-placed.publisher';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

/** Placing an order, reading it back, and the emails and the event that follow it. See docs/ORDERS.md. */
@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    CartModule,
    CheckoutModule,
    EventsModule,
    EmailModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersRepository,
    OrdersService,
    OrderConfirmationHandler,
    OfficeNotificationHandler,
    OrderPlacedPublisher,
  ],
})
export class OrdersModule {}
