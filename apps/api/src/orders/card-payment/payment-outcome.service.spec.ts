import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DominaiteWebhookEvent } from '@dominaite/merchant-sdk';
import {
  CardPaymentRepository,
  ReportedAttempt,
} from './card-payment.repository';
import { PaymentOutcomeService } from './payment-outcome.service';

const ATTEMPT: ReportedAttempt = {
  id: 'payment-1',
  orderId: 'order-1',
  transactionId: 'tx-1',
  orderStatus: 'PENDING_PAYMENT',
  orderTotal: 4845,
};

function paymentEvent(
  type: string,
  data: Record<string, unknown> = {},
): DominaiteWebhookEvent {
  return {
    id: 'delivery-1',
    type,
    createdAt: '2026-10-23T10:00:00Z',
    data: {
      transactionId: 'tx-1',
      status: type.replace('payment.', ''),
      amount: 4845,
      currency: 'EUR',
      ...data,
    },
  } as DominaiteWebhookEvent;
}

describe('PaymentOutcomeService', () => {
  let service: PaymentOutcomeService;

  const findReportedAttempt = jest.fn();
  const confirmPaid = jest.fn();
  const closeAttempt = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    findReportedAttempt.mockResolvedValue(ATTEMPT);
    confirmPaid.mockResolvedValue('applied');
    closeAttempt.mockResolvedValue('applied');

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentOutcomeService,
        {
          provide: CardPaymentRepository,
          useValue: { findReportedAttempt, confirmPaid, closeAttempt },
        },
      ],
    }).compile();

    service = moduleRef.get(PaymentOutcomeService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('payment.succeeded', () => {
    it('confirms the order, naming the delivery so a repeat changes nothing', async () => {
      await service.applyWebhookEvent(paymentEvent('payment.succeeded'));

      expect(findReportedAttempt).toHaveBeenCalledWith('tx-1');
      expect(confirmPaid).toHaveBeenCalledWith(
        { id: 'delivery-1', type: 'payment.succeeded' },
        ATTEMPT,
      );
    });

    it('leaves the order unpaid, and says so loudly, when the amount is not its total', async () => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.applyWebhookEvent(
        paymentEvent('payment.succeeded', { amount: 100 }),
      );

      expect(confirmPaid).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('order-1'));
    });

    it('leaves the order unpaid when it was paid in another currency', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await service.applyWebhookEvent(
        paymentEvent('payment.succeeded', { currency: 'BGN' }),
      );

      expect(confirmPaid).not.toHaveBeenCalled();
    });

    it('says loudly that a cancelled order was paid, so it is refunded', async () => {
      findReportedAttempt.mockResolvedValue({
        ...ATTEMPT,
        orderStatus: 'CANCELLED',
      });
      confirmPaid.mockResolvedValue('unchanged');
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.applyWebhookEvent(paymentEvent('payment.succeeded'));

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('cancelled'),
      );
    });

    it('takes a success for an order already paid quietly', async () => {
      findReportedAttempt.mockResolvedValue({
        ...ATTEMPT,
        orderStatus: 'PROCESSING',
      });
      confirmPaid.mockResolvedValue('unchanged');
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.applyWebhookEvent(paymentEvent('payment.succeeded'));

      expect(logError).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['payment.failed', 'FAILED'],
    ['payment.abandoned', 'ABANDONED'],
    ['payment.cancelled', 'CANCELLED'],
  ])(
    'closes the attempt on %s, leaving the order as it is',
    async (type, status) => {
      await service.applyWebhookEvent(paymentEvent(type));

      expect(closeAttempt).toHaveBeenCalledWith(
        { id: 'delivery-1', type },
        'payment-1',
        status,
      );
      expect(confirmPaid).not.toHaveBeenCalled();
    },
  );

  it.each(['payment.refunded', 'payment.disputed', 'agreement.activated'])(
    'ignores %s',
    async (type) => {
      await service.applyWebhookEvent(paymentEvent(type));

      expect(findReportedAttempt).not.toHaveBeenCalled();
      expect(confirmPaid).not.toHaveBeenCalled();
      expect(closeAttempt).not.toHaveBeenCalled();
    },
  );

  it('ignores a payment that is none of ours', async () => {
    findReportedAttempt.mockResolvedValue(null);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await service.applyWebhookEvent(paymentEvent('payment.succeeded'));

    expect(confirmPaid).not.toHaveBeenCalled();
  });
});
