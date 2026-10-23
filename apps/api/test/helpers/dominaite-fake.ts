import { randomUUID } from 'node:crypto';
import { CheckoutRefusedError } from '@dominaite/merchant-sdk';
import type {
  CheckoutSession,
  CreateCheckoutSessionParams,
} from '@dominaite/merchant-sdk';

const SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;

type SpentKeyRefusal = 'ALREADY_PROCESSED' | 'PRIOR_ATTEMPT_FAILED';

/**
 * Stands in for Dominaite's client in the e2e suites. Like Dominaite, it
 * answers a key's open session again, and refuses a key whose payment ended.
 */
export class DominaiteFake {
  readonly opened: CreateCheckoutSessionParams[] = [];
  private readonly sessions = new Map<string, CheckoutSession>();
  private readonly spentKeys = new Map<string, SpentKeyRefusal>();

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

  /** The session's payment ends, as the widget would end it. */
  settle(transactionId: string, outcome: 'paid' | 'failed'): void {
    const key = [...this.sessions].find(
      ([, session]) => session.transactionId === transactionId,
    )?.[0];

    if (!key) {
      throw new Error(`No session ${transactionId}`);
    }

    this.spentKeys.set(
      key,
      outcome === 'paid' ? 'ALREADY_PROCESSED' : 'PRIOR_ATTEMPT_FAILED',
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
