import type { OutboxMessage } from '../../events';
import { readRefundDue } from './card-payment-refund-due.event';

const PAYLOAD = {
  orderId: 'order-1',
  orderReference: 'VP-ORD-000123',
  transactionId: 'tx-1',
};

function eventWith(payload: unknown): OutboxMessage {
  return {
    eventId: 'event-1',
    type: 'CardPaymentRefundDue',
    payload: payload as OutboxMessage['payload'],
    occurredAt: new Date('2026-10-24T10:00:00Z'),
    attempts: 1,
  };
}

describe('readRefundDue', () => {
  it('reads the payment to give back', () => {
    expect(readRefundDue(eventWith(PAYLOAD))).toEqual(PAYLOAD);
  });

  it.each([
    ['no payload', null],
    ['no transaction', { ...PAYLOAD, transactionId: undefined }],
    [
      'an order reference that is not a string',
      { ...PAYLOAD, orderReference: 123 },
    ],
  ])('refuses an event with %s', (_case, payload) => {
    expect(() => readRefundDue(eventWith(payload))).toThrow(
      'CardPaymentRefundDue event-1 names no payment',
    );
  });
});
