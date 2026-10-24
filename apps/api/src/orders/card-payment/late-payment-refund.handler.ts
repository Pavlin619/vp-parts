import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OutboxHandler, OutboxMessage, OutboxRelay } from '../../events';
import { DominaiteGateway } from '../../payments';
import {
  CARD_PAYMENT_REFUND_DUE,
  readRefundDue,
} from './card-payment-refund-due.event';

/**
 * Gives back a payment its order no longer waited for. The key is the
 * payment's own, so a retried event never refunds twice.
 */
@Injectable()
export class LatePaymentRefundHandler implements OutboxHandler, OnModuleInit {
  readonly name = 'late-payment-refund';
  readonly eventType = CARD_PAYMENT_REFUND_DUE;

  private readonly logger = new Logger(LatePaymentRefundHandler.name);

  constructor(
    private readonly relay: OutboxRelay,
    private readonly gateway: DominaiteGateway,
  ) {}

  onModuleInit(): void {
    this.relay.register(this);
  }

  async handle(event: OutboxMessage): Promise<void> {
    const { orderReference, transactionId } = readRefundDue(event);

    const outcome = await this.gateway.refundPayment({
      transactionId,
      idempotencyKey: `late-${transactionId}`,
      reason: `${orderReference}: paid after the order was cancelled`,
    });

    if (outcome === 'nothing-to-refund') {
      this.logger.warn(`${transactionId} has nothing left to refund`);
    }
  }
}
