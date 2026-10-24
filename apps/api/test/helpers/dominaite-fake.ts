import { randomUUID } from 'node:crypto';
import { ApiError, CheckoutRefusedError } from '@dominaite/merchant-sdk';
import type {
  CheckoutSession,
  CheckoutStatus,
  CreateCheckoutSessionParams,
  CreateRefundParams,
  Refund,
} from '@dominaite/merchant-sdk';

const SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;

type SpentKeyRefusal = 'ALREADY_PROCESSED' | 'PRIOR_ATTEMPT_FAILED';

type Outcome = 'paid' | 'failed' | 'abandoned';

const STATUS_OF: Record<Outcome, string> = {
  paid: 'succeeded',
  failed: 'failed',
  abandoned: 'abandoned',
};

/**
 * Stands in for Dominaite's client in the e2e suites. Like Dominaite, it
 * answers a key's open session again, refuses a key whose payment ended, and
 * reads an open session as `pending`.
 */
export class DominaiteFake {
  readonly opened: CreateCheckoutSessionParams[] = [];
  readonly refunds: { transactionId: string; params: CreateRefundParams }[] =
    [];
  private readonly sessions = new Map<string, CheckoutSession>();
  private readonly spentKeys = new Map<string, SpentKeyRefusal>();
  private readonly statuses = new Map<string, string>();

  createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSession> {
    this.opened.push(params);
    const key = params.idempotencyKey;
    const refusal = this.spentKeys.get(key);
    const session = this.sessions.get(key) ?? this.newSession(params);

    if (refusal) {
      return Promise.reject(
        new CheckoutRefusedError(refusal, refusal, session.transactionId),
      );
    }

    this.sessions.set(key, session);

    return Promise.resolve(session);
  }

  getStatus(transactionId: string): Promise<CheckoutStatus> {
    const session = this.sessionOf(transactionId);

    if (!session) {
      return Promise.reject(
        new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND'),
      );
    }

    return Promise.resolve({
      transactionId,
      orderId: session.orderId,
      status: this.statuses.get(transactionId) ?? 'pending',
      amount: session.amount,
      currency: session.currency,
    } as CheckoutStatus);
  }

  createRefund(
    transactionId: string,
    params: CreateRefundParams,
  ): Promise<Refund> {
    this.refunds.push({ transactionId, params });

    return Promise.resolve({
      refundId: `re_${randomUUID().replaceAll('-', '')}`,
      transactionId,
      status: 'pending',
      amount: null,
      currency: 'EUR',
      failureCode: null,
      failureMessage: null,
      completedAt: null,
    } as Refund);
  }

  /** The session's payment ends, as the widget, or the session's expiry, would end it. */
  settle(transactionId: string, outcome: Outcome): void {
    const key = [...this.sessions].find(
      ([, session]) => session.transactionId === transactionId,
    )?.[0];

    if (!key) {
      throw new Error(`No session ${transactionId}`);
    }

    this.statuses.set(transactionId, STATUS_OF[outcome]);
    this.spentKeys.set(
      key,
      outcome === 'paid' ? 'ALREADY_PROCESSED' : 'PRIOR_ATTEMPT_FAILED',
    );
  }

  private sessionOf(transactionId: string): CheckoutSession | undefined {
    return [...this.sessions.values()].find(
      (session) => session.transactionId === transactionId,
    );
  }

  private newSession(params: CreateCheckoutSessionParams): CheckoutSession {
    return {
      transactionId: randomUUID(),
      orderId: `dom_${this.sessions.size + 1}`,
      cashierKey: `ck_${this.sessions.size + 1}`,
      cashierToken: randomUUID(),
      amount: params.amount ?? 0,
      currency: params.currency,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString(),
      integration: 'widget',
    };
  }
}
