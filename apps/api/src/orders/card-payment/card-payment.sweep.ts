import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DominaiteGateway, PaymentUnavailableException } from '../../payments';
import {
  CardPaymentRepository,
  ReportedAttempt,
} from './card-payment.repository';
import {
  MAX_PAYMENT_ATTEMPTS,
  UNOPENED_ORDER_HOLD_MS,
} from './card-payment.policy';
import { PaymentOutcomeService } from './payment-outcome.service';

/** The interval's name in the `SchedulerRegistry`. */
export const CARD_PAYMENT_SWEEP_INTERVAL = 'card-payment-sweep';

const SWEEP_EVERY_MS = 5 * 60_000;
const RECHECK_AFTER_MS = 5 * 60_000;
/** Dominaite allows a key 60 requests a minute, and opening payments needs its share. */
const SESSIONS_PER_RUN = 20;
const LAPSED_ORDERS_PER_RUN = 50;

/**
 * The reconciliation Dominaite calls mandatory, since a webhook can be lost:
 * reads every open session and applies what it says, and cancels the orders
 * no session can pay any more — docs/PAYMENTS.md → "The sweep".
 */
@Injectable()
export class CardPaymentSweep {
  private readonly logger = new Logger(CardPaymentSweep.name);
  private isSweeping = false;

  constructor(
    private readonly payments: CardPaymentRepository,
    private readonly gateway: DominaiteGateway,
    private readonly outcomes: PaymentOutcomeService,
  ) {}

  @Interval(CARD_PAYMENT_SWEEP_INTERVAL, SWEEP_EVERY_MS)
  async sweep(): Promise<void> {
    if (this.isSweeping) {
      return;
    }

    this.isSweeping = true;

    try {
      const now = new Date();

      await this.reconcileOpenSessions(now);
      await this.cancelLapsedOrders(now);
    } finally {
      this.isSweeping = false;
    }
  }

  private async reconcileOpenSessions(now: Date): Promise<void> {
    const attempts = await this.payments.claimAttemptsDue({
      now,
      limit: SESSIONS_PER_RUN,
      leaseMs: RECHECK_AFTER_MS,
    });

    for (const attempt of attempts) {
      try {
        await this.reconcile(attempt, now);
      } catch (error) {
        if (error instanceof PaymentUnavailableException) {
          this.logger.warn('Dominaite unavailable; the sweep resumes next run');
          return;
        }

        this.logger.warn(
          `Order ${attempt.orderId} attempt ${attempt.attempt} not reconciled: ${describeError(error)}`,
        );
      }
    }
  }

  private async reconcile(attempt: ReportedAttempt, now: Date): Promise<void> {
    const state = await this.gateway.readCheckoutSession(attempt.transactionId);

    await this.outcomes.applySessionState(attempt, state, now);
  }

  private async cancelLapsedOrders(now: Date): Promise<void> {
    const orderIds = await this.payments.findLapsedOrders({
      now,
      placedBefore: new Date(now.getTime() - UNOPENED_ORDER_HOLD_MS),
      maxAttempts: MAX_PAYMENT_ATTEMPTS,
      limit: LAPSED_ORDERS_PER_RUN,
    });

    for (const orderId of orderIds) {
      try {
        await this.outcomes.cancelUnpaid({
          orderId,
          closing: null,
          source: 'shop',
        });
      } catch (error) {
        this.logger.warn(
          `Order ${orderId} not cancelled: ${describeError(error)}`,
        );
      }
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
