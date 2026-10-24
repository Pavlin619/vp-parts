import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboxMessage, OutboxRelay } from '../../events';
import { DominaiteGateway, PaymentUnavailableException } from '../../payments';
import { LatePaymentRefundHandler } from './late-payment-refund.handler';

const EVENT: OutboxMessage = {
  eventId: 'event-1',
  type: 'CardPaymentRefundDue',
  payload: {
    orderId: 'order-1',
    orderReference: 'VP-ORD-000123',
    transactionId: 'tx-1',
  },
  occurredAt: new Date('2026-10-24T10:00:00Z'),
  attempts: 1,
};

describe('LatePaymentRefundHandler', () => {
  let handler: LatePaymentRefundHandler;

  const relay = { register: jest.fn() };
  const refundPayment = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    refundPayment.mockResolvedValue('queued');

    const moduleRef = await Test.createTestingModule({
      providers: [
        LatePaymentRefundHandler,
        { provide: OutboxRelay, useValue: relay },
        { provide: DominaiteGateway, useValue: { refundPayment } },
      ],
    }).compile();

    handler = moduleRef.get(LatePaymentRefundHandler);
  });

  afterEach(() => jest.restoreAllMocks());

  it('takes CardPaymentRefundDue from the relay', () => {
    handler.onModuleInit();

    expect(handler.eventType).toBe('CardPaymentRefundDue');
    expect(relay.register).toHaveBeenCalledWith(handler);
  });

  it('refunds the whole payment under a key of its own, so a retry never refunds twice', async () => {
    await handler.handle(EVENT);

    expect(refundPayment).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      idempotencyKey: 'late-tx-1',
      reason: expect.stringContaining('VP-ORD-000123'),
    });
  });

  it('is done when the payment was refunded already', async () => {
    refundPayment.mockResolvedValue('nothing-to-refund');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(handler.handle(EVENT)).resolves.toBeUndefined();
  });

  it('fails, for the relay to retry, while Dominaite cannot be reached', async () => {
    refundPayment.mockRejectedValue(new PaymentUnavailableException());

    await expect(handler.handle(EVENT)).rejects.toBeInstanceOf(
      PaymentUnavailableException,
    );
  });

  it('fails on an event that names no payment', async () => {
    await expect(
      handler.handle({ ...EVENT, payload: { orderId: 'order-1' } }),
    ).rejects.toThrow('names no payment');
    expect(refundPayment).not.toHaveBeenCalled();
  });
});
