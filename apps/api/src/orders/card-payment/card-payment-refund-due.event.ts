import type { OutboxMessage } from '../../events';

/**
 * A card payment that arrived once its order no longer waited for it, so it is
 * given back. Like `OrderPlaced`, it carries no customer data.
 */
export const CARD_PAYMENT_REFUND_DUE = 'CardPaymentRefundDue';

export interface CardPaymentRefundDuePayload {
  orderId: string;
  orderReference: string;
  transactionId: string;
}

export function readRefundDue(
  event: OutboxMessage,
): CardPaymentRefundDuePayload {
  const payload = (event.payload ?? {}) as Partial<CardPaymentRefundDuePayload>;
  const { orderId, orderReference, transactionId } = payload;

  if (
    typeof orderId !== 'string' ||
    typeof orderReference !== 'string' ||
    typeof transactionId !== 'string'
  ) {
    throw new Error(`${event.type} ${event.eventId} names no payment`);
  }

  return { orderId, orderReference, transactionId };
}
