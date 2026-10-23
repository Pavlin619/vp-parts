import { Injectable, Logger } from '@nestjs/common';
import type { OrderPaymentSessionDto } from '@vp-parts-shop/shared';
import { CustomersService } from '../../customers';
import { CardPaymentStatus, OrderStatus } from '../../generated/prisma';
import {
  CheckoutKeySpentError,
  DominaiteGateway,
  OpenedCheckoutSession,
} from '../../payments';
import {
  OrderNotFoundException,
  OrderNotPayableException,
  OrderPaymentProcessingException,
} from '../orders.exceptions';
import {
  CardPaymentRepository,
  PayableOrder,
  PaymentAttempt,
} from './card-payment.repository';

/** Each decline opens a fresh two-hour session, so an order takes only so many. */
export const MAX_PAYMENT_ATTEMPTS = 5;

/**
 * Opens a card order's payment session for the widget — docs/PAYMENTS.md. The
 * amount is the order's total as stored, never one the browser sends.
 */
@Injectable()
export class CardPaymentService {
  private readonly logger = new Logger(CardPaymentService.name);

  constructor(
    private readonly customers: CustomersService,
    private readonly payments: CardPaymentRepository,
    private readonly gateway: DominaiteGateway,
  ) {}

  async openPayment(
    clerkId: string,
    orderReference: string,
  ): Promise<OrderPaymentSessionDto> {
    const order = await this.findPayableOrder(clerkId, orderReference);
    const attempt = attemptToOpen(order.latestAttempt, new Date());
    const session = await this.openAttempt(order, attempt);

    return {
      cashierKey: session.cashierKey,
      cashierToken: session.cashierToken,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  private async findPayableOrder(
    clerkId: string,
    orderReference: string,
  ): Promise<PayableOrder> {
    const customer = await this.customers.findByClerkId(clerkId);
    const order = customer
      ? await this.payments.findOwnedOrder(orderReference, customer.id)
      : null;

    if (!order) {
      throw new OrderNotFoundException();
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new OrderNotPayableException();
    }

    return order;
  }

  /** A key whose payment failed opens nothing again, so the retry is the next attempt. */
  private async openAttempt(
    order: PayableOrder,
    attempt: number,
  ): Promise<OpenedCheckoutSession> {
    try {
      return await this.openSession(order, attempt);
    } catch (error) {
      if (!(error instanceof CheckoutKeySpentError)) {
        throw error;
      }

      if (error.outcome === 'paid') {
        this.logger.warn(`Order ${order.id} is paid, not yet confirmed`);
        throw new OrderPaymentProcessingException();
      }

      await this.payments.markFailed(order.id, attempt);

      return this.openSession(order, attemptAfter(attempt));
    }
  }

  private async openSession(
    order: PayableOrder,
    attempt: number,
  ): Promise<OpenedCheckoutSession> {
    const session = await this.gateway.openCheckoutSession({
      orderReference: order.orderReference,
      attempt,
      amount: order.total,
      customer: order.payer,
    });

    await this.payments.recordOpened(order.id, attempt, session);
    this.logger.log(`Order ${order.id} payment attempt ${attempt} opened`);

    return session;
  }
}

/**
 * The open attempt is asked for again, which answers its session. One whose
 * session has ended leaves the order to be cancelled, never paid late: asked
 * for again, Dominaite would answer an expired key with a fresh session.
 */
function attemptToOpen(latest: PaymentAttempt | null, now: Date): number {
  if (!latest) {
    return 1;
  }

  if (latest.status === CardPaymentStatus.FAILED) {
    return attemptAfter(latest.attempt);
  }

  if (latest.status === CardPaymentStatus.OPEN && latest.expiresAt > now) {
    return latest.attempt;
  }

  throw new OrderNotPayableException();
}

function attemptAfter(failedAttempt: number): number {
  if (failedAttempt >= MAX_PAYMENT_ATTEMPTS) {
    throw new OrderNotPayableException();
  }

  return failedAttempt + 1;
}
