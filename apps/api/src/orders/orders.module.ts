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
import { CardPaymentSweep } from './card-payment/card-payment.sweep';
import { DominaiteWebhookController } from './card-payment/dominaite-webhook.controller';
import { LatePaymentRefundHandler } from './card-payment/late-payment-refund.handler';
import { PaymentOutcomeService } from './card-payment/payment-outcome.service';
import { OfficeNotificationHandler } from './emails/office-notification.handler';
import { OrderConfirmationHandler } from './emails/order-confirmation.handler';
import { OrderAccessKeys } from './order-access-keys';
import { OrderPlacedPublisher } from './order-placed.publisher';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

/**
 * Placing an order, reading it back, paying a card order or cancelling it
 * unpaid, and the emails and the event that follow. See docs/ORDERS.md and docs/PAYMENTS.md.
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
  controllers: [
    OrdersController,
    CardPaymentController,
    DominaiteWebhookController,
  ],
  providers: [
    OrderAccessKeys,
    OrdersRepository,
    OrdersService,
    OrderConfirmationHandler,
    OfficeNotificationHandler,
    OrderPlacedPublisher,
    CardPaymentRepository,
    CardPaymentService,
    PaymentOutcomeService,
    CardPaymentSweep,
    LatePaymentRefundHandler,
  ],
})
export class OrdersModule {}
