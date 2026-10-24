import { Injectable, Logger } from '@nestjs/common';
import type {
  DominaiteWebhookEvent,
  PaymentWebhookEvent,
} from '@dominaite/merchant-sdk';
import { CardPaymentStatus, OrderStatus } from '../../generated/prisma';
import { PAYMENT_CURRENCY } from '../../payments';
import {
  CardPaymentRepository,
  ReportedAttempt,
  WebhookDelivery,
} from './card-payment.repository';

const ATTEMPT_STATUS_BY_EVENT = {
  'payment.succeeded': CardPaymentStatus.SUCCEEDED,
  'payment.failed': CardPaymentStatus.FAILED,
  'payment.abandoned': CardPaymentStatus.ABANDONED,
  'payment.cancelled': CardPaymentStatus.CANCELLED,
} as const;

type OutcomeEvent = PaymentWebhookEvent & {
  type: keyof typeof ATTEMPT_STATUS_BY_EVENT;
};

/**
 * What Dominaite reports about a payment, applied to its attempt and order —
 * docs/PAYMENTS.md → "The webhook". Only a success for the order's whole total
 * marks it paid.
 */
@Injectable()
export class PaymentOutcomeService {
  private readonly logger = new Logger(PaymentOutcomeService.name);

  constructor(private readonly payments: CardPaymentRepository) {}

  async applyWebhookEvent(event: DominaiteWebhookEvent): Promise<void> {
    if (!isOutcomeEvent(event)) {
      this.logger.debug(`Ignored Dominaite ${event.type} ${event.id}`);
      return;
    }

    const { transactionId } = event.data;
    const attempt = await this.payments.findReportedAttempt(transactionId);

    if (!attempt) {
      this.logger.warn(`Dominaite ${event.type} for unknown ${transactionId}`);
      return;
    }

    const delivery = { id: event.id, type: event.type };
    const status = ATTEMPT_STATUS_BY_EVENT[event.type];

    if (status === CardPaymentStatus.SUCCEEDED) {
      await this.confirm(delivery, attempt, event.data);
    } else {
      await this.payments.closeAttempt(delivery, attempt.id, status);
    }
  }

  private async confirm(
    delivery: WebhookDelivery,
    attempt: ReportedAttempt,
    { amount, currency }: PaymentWebhookEvent['data'],
  ): Promise<void> {
    if (amount !== attempt.orderTotal || currency !== PAYMENT_CURRENCY) {
      this.logger.error(
        `Order ${attempt.orderId} left unpaid: Dominaite took ${amount} ${currency}, ` +
          `its total is ${attempt.orderTotal} ${PAYMENT_CURRENCY}`,
      );
      return;
    }

    const effect = await this.payments.confirmPaid(delivery, attempt);

    if (effect === 'applied') {
      this.logger.log(`Order ${attempt.orderId} paid by card`);
    } else if (attempt.orderStatus === OrderStatus.CANCELLED) {
      this.logger.error(
        `Order ${attempt.orderId} was paid after it was cancelled; refund ${attempt.transactionId}`,
      );
    }
  }
}

function isOutcomeEvent(event: DominaiteWebhookEvent): event is OutcomeEvent {
  return Object.hasOwn(ATTEMPT_STATUS_BY_EVENT, event.type);
}
