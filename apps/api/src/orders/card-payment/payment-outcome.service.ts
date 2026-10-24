import { Injectable, Logger } from '@nestjs/common';
import type {
  DominaiteWebhookEvent,
  PaymentWebhookEvent,
} from '@dominaite/merchant-sdk';
import { CardPaymentStatus } from '../../generated/prisma';
import { CheckoutSessionState, PAYMENT_CURRENCY } from '../../payments';
import {
  CancellationSource,
  CardPaymentRepository,
  DeliveryEffect,
  ReportedAttempt,
  UnpaidCancellation,
  WebhookDelivery,
} from './card-payment.repository';
import {
  GRACE_AFTER_EXPIRY_MS,
  MAX_PAYMENT_ATTEMPTS,
} from './card-payment.policy';

const ATTEMPT_STATUS_BY_EVENT = {
  'payment.succeeded': CardPaymentStatus.SUCCEEDED,
  'payment.failed': CardPaymentStatus.FAILED,
  'payment.abandoned': CardPaymentStatus.ABANDONED,
  'payment.cancelled': CardPaymentStatus.CANCELLED,
} as const;

type OutcomeEvent = PaymentWebhookEvent & {
  type: keyof typeof ATTEMPT_STATUS_BY_EVENT;
};

type EndedStatus = Exclude<
  CardPaymentStatus,
  typeof CardPaymentStatus.OPEN | typeof CardPaymentStatus.SUCCEEDED
>;

interface Payment {
  amount: number;
  currency: string;
}

/**
 * What Dominaite reports about a payment, from its webhook or the sweep's
 * read, applied to the attempt and its order — docs/PAYMENTS.md. Only a
 * success for the order's whole total marks it paid.
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
      await this.end(delivery, attempt, status, 'dominaite');
    }
  }

  /** An open session as the sweep read it. One that may still be paid is left open. */
  async applySessionState(
    attempt: ReportedAttempt,
    state: CheckoutSessionState,
    now: Date,
  ): Promise<void> {
    if (state.isPaid) {
      await this.confirm(null, attempt, state);
    } else if (state.isTerminal) {
      await this.end(null, attempt, endedStatusOf(state.status), 'dominaite');
    } else if (isPastGrace(attempt, now)) {
      await this.end(null, attempt, CardPaymentStatus.ABANDONED, 'shop');
    }
  }

  async cancelUnpaid(
    cancellation: UnpaidCancellation,
    delivery: WebhookDelivery | null = null,
  ): Promise<DeliveryEffect> {
    const effect = await this.payments.cancelUnpaid(delivery, cancellation);

    if (effect === 'applied') {
      this.logger.log(
        `Order ${cancellation.orderId} cancelled unpaid (${cancellation.source})`,
      );
    }

    return effect;
  }

  private async confirm(
    delivery: WebhookDelivery | null,
    attempt: ReportedAttempt,
    { amount, currency }: Payment,
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
    } else if (effect === 'refund-due') {
      this.logger.error(
        `Order ${attempt.orderId} was paid once it no longer waited for it; ` +
          `refunding ${attempt.transactionId}`,
      );
    }
  }

  /** A declined card leaves the order open for another, unless it was the last one allowed. */
  private async end(
    delivery: WebhookDelivery | null,
    attempt: ReportedAttempt,
    status: EndedStatus,
    source: CancellationSource,
  ): Promise<void> {
    const isRetryable =
      status === CardPaymentStatus.FAILED &&
      attempt.attempt < MAX_PAYMENT_ATTEMPTS;

    if (isRetryable) {
      await this.payments.closeAttempt(delivery, attempt.id, status);
      return;
    }

    await this.cancelUnpaid(
      {
        orderId: attempt.orderId,
        closing: { attemptId: attempt.id, status },
        source,
      },
      delivery,
    );
  }
}

/** A terminal status that is not `succeeded`. One added later, or `refunded`, reads as cancelled. */
export function endedStatusOf(status: string): EndedStatus {
  switch (status) {
    case 'failed':
      return CardPaymentStatus.FAILED;
    case 'abandoned':
      return CardPaymentStatus.ABANDONED;
    default:
      return CardPaymentStatus.CANCELLED;
  }
}

function isPastGrace(attempt: ReportedAttempt, now: Date): boolean {
  return now.getTime() > attempt.expiresAt.getTime() + GRACE_AFTER_EXPIRY_MS;
}

function isOutcomeEvent(event: DominaiteWebhookEvent): event is OutcomeEvent {
  return Object.hasOwn(ATTEMPT_STATUS_BY_EVENT, event.type);
}
