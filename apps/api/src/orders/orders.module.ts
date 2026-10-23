import { Module } from '@nestjs/common';
import { BotCheckModule } from '../bot-check';
import { CartModule } from '../cart';
import { CheckoutModule } from '../checkout';
import { CustomersModule } from '../customers';
import { EmailModule } from '../email';
import { EventsModule } from '../events';
import { PaymentsModule } from '../payments';
import { PrismaModule } from '../prisma';
import { CardPaymentController } from './card-payment/card-payment.controller';
import { CardPaymentRepository } from './card-payment/card-payment.repository';
import { CardPaymentService } from './card-payment/card-payment.service';
import { OfficeNotificationHandler } from './emails/office-notification.handler';
import { OrderConfirmationHandler } from './emails/order-confirmation.handler';
import { OrderAccessKeys } from './order-access-keys';
import { OrderPlacedPublisher } from './order-placed.publisher';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

/**
 * Placing an order, reading it back, paying a card order, and the emails and
 * the event that follow. See docs/ORDERS.md and docs/PAYMENTS.md.
 */
@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    CartModule,
    CheckoutModule,
    EventsModule,
    EmailModule,
    BotCheckModule,
    PaymentsModule,
  ],
  controllers: [OrdersController, CardPaymentController],
  providers: [
    OrderAccessKeys,
    OrdersRepository,
    OrdersService,
    OrderConfirmationHandler,
    OfficeNotificationHandler,
    OrderPlacedPublisher,
    CardPaymentRepository,
    CardPaymentService,
  ],
})
export class OrdersModule {}
