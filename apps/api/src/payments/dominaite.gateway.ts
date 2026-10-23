import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CheckoutRefusedError,
  DominaiteClient,
  ErrorCodes,
  RateLimitError,
  TransportError,
  isPaid,
  isTerminal,
  orderIdempotencyKey,
} from '@dominaite/merchant-sdk';
import type { CheckoutCustomer } from '@dominaite/merchant-sdk';
import { DOMINAITE_CLIENT } from './dominaite.client';
import { PaymentUnavailableException } from './payments.exceptions';

export const PAYMENT_CURRENCY = 'EUR';

export interface CheckoutPayer {
  firstName: string;
  lastName: string;
  email: string | null;
  /** E.164. */
  phone: string;
}

export interface CheckoutSessionRequest {
  orderReference: string;
  /** Counts from 1. A session that ended unpaid spends its key, so a retry is the next attempt. */
  attempt: number;
  /** Euro cents, from the order: never from the browser. */
  amount: number;
  customer: CheckoutPayer;
}

export interface OpenedCheckoutSession {
  transactionId: string;
  /** For the widget's `data-cashier-*` attributes. Not credentials, but never logged. */
  cashierKey: string;
  cashierToken: string;
  amount: number;
  currency: string;
  expiresAt: Date;
}

export interface CheckoutSessionState {
  transactionId: string;
  status: string;
  amount: number;
  currency: string;
  isPaid: boolean;
  /** False for a status the SDK does not know, which must keep an order open. */
  isTerminal: boolean;
}

/** The attempt's key already ended in a payment, or a failure; it opens no session again. */
export class CheckoutKeySpentError extends Error {
  constructor(
    readonly outcome: 'paid' | 'failed',
    readonly transactionId: string | null,
  ) {
    super(`The checkout key's payment already ${outcome}`);
  }
}

const RETRYABLE_REFUSALS = new Set<string>([
  ErrorCodes.PAYMENT_PROCESSING_UNAVAILABLE,
  ErrorCodes.DUPLICATE_REQUEST,
]);

const SPENT_KEY_OUTCOMES: Record<string, CheckoutKeySpentError['outcome']> = {
  [ErrorCodes.ALREADY_PROCESSED]: 'paid',
  [ErrorCodes.PRIOR_ATTEMPT_FAILED]: 'failed',
};

/** Dominaite's hosted checkout, as card payments use it — docs/PAYMENTS.md. */
@Injectable()
export class DominaiteGateway {
  private readonly logger = new Logger(DominaiteGateway.name);

  constructor(
    @Inject(DOMINAITE_CLIENT) private readonly client: DominaiteClient,
  ) {}

  /** The same order, attempt and amount answer the same open session, so a reload is safe. */
  async openCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<OpenedCheckoutSession> {
    try {
      const session = await this.client.createCheckoutSession({
        amount: request.amount,
        currency: PAYMENT_CURRENCY,
        orderReference: request.orderReference,
        language: 'bg',
        customer: toCheckoutCustomer(request.customer),
        idempotencyKey: checkoutKeyOf(request),
      });

      return {
        transactionId: session.transactionId,
        cashierKey: session.cashierKey,
        cashierToken: session.cashierToken,
        amount: session.amount,
        currency: session.currency,
        expiresAt: new Date(session.expiresAt),
      };
    } catch (error) {
      throw this.translate(error);
    }
  }

  async readCheckoutSession(
    transactionId: string,
  ): Promise<CheckoutSessionState> {
    try {
      const { status, amount, currency } =
        await this.client.getStatus(transactionId);

      return {
        transactionId,
        status,
        amount,
        currency,
        isPaid: isPaid(status),
        isTerminal: isTerminal(status),
      };
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): unknown {
    if (error instanceof CheckoutRefusedError) {
      return this.translateRefusal(error);
    }

    if (error instanceof TransportError || error instanceof RateLimitError) {
      return this.unavailable(error.name, error.errorCode);
    }

    return error;
  }

  private translateRefusal(refusal: CheckoutRefusedError): Error {
    const spentOutcome = SPENT_KEY_OUTCOMES[refusal.errorCode];

    if (spentOutcome) {
      return new CheckoutKeySpentError(
        spentOutcome,
        refusal.transactionId ?? null,
      );
    }

    if (RETRYABLE_REFUSALS.has(refusal.errorCode)) {
      return this.unavailable(refusal.name, refusal.errorCode);
    }

    return new Error(`Dominaite refused the session: ${refusal.errorCode}`);
  }

  private unavailable(
    errorName: string,
    errorCode: string | undefined,
  ): PaymentUnavailableException {
    this.logger.warn(
      `Dominaite unavailable: ${[errorName, errorCode].filter(Boolean).join(' ')}`,
    );

    return new PaymentUnavailableException();
  }
}

function checkoutKeyOf({
  orderReference,
  attempt,
  amount,
}: CheckoutSessionRequest): string {
  return orderIdempotencyKey({
    scope: `checkout-${attempt}`,
    orderId: orderReference,
    amountMinor: amount,
    currency: PAYMENT_CURRENCY,
  });
}

function toCheckoutCustomer({
  email,
  ...payer
}: CheckoutPayer): CheckoutCustomer {
  return email ? { ...payer, email } : payer;
}
