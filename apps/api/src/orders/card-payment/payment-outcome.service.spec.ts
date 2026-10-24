import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DominaiteWebhookEvent } from '@dominaite/merchant-sdk';
import type { CheckoutSessionState } from '../../payments';
import {
  CardPaymentRepository,
  ReportedAttempt,
} from './card-payment.repository';
import { MAX_PAYMENT_ATTEMPTS } from './card-payment.policy';
import {
  PaymentOutcomeService,
  endedStatusOf,
} from './payment-outcome.service';

const EXPIRES_AT = new Date('2026-10-23T12:00:00Z');

const ATTEMPT: ReportedAttempt = {
  id: 'payment-1',
  orderId: 'order-1',
  orderReference: 'VP-ORD-000123',
  attempt: 1,
  transactionId: 'tx-1',
  expiresAt: EXPIRES_AT,
  orderStatus: 'PENDING_PAYMENT',
  orderTotal: 4845,
};

const LAST_ATTEMPT = { ...ATTEMPT, attempt: MAX_PAYMENT_ATTEMPTS };

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

function sessionState(
  status: string,
  outcome: { isPaid: boolean; isTerminal: boolean },
): CheckoutSessionState {
  return {
    transactionId: 'tx-1',
    status,
    amount: 4845,
    currency: 'EUR',
    ...outcome,
  };
}

const PENDING = sessionState('pending', { isPaid: false, isTerminal: false });

describe('PaymentOutcomeService', () => {
  let service: PaymentOutcomeService;

  const findReportedAttempt = jest.fn();
  const confirmPaid = jest.fn();
  const closeAttempt = jest.fn();
  const cancelUnpaid = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    findReportedAttempt.mockResolvedValue(ATTEMPT);
    confirmPaid.mockResolvedValue('applied');
    closeAttempt.mockResolvedValue('applied');
    cancelUnpaid.mockResolvedValue('applied');
    jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentOutcomeService,
        {
          provide: CardPaymentRepository,
          useValue: {
            findReportedAttempt,
            confirmPaid,
            closeAttempt,
            cancelUnpaid,
          },
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

    it('says loudly that a payment is given back when its order no longer waited for it', async () => {
      confirmPaid.mockResolvedValue('refund-due');
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.applyWebhookEvent(paymentEvent('payment.succeeded'));

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('refunding tx-1'),
      );
    });

    it('takes a success already applied quietly', async () => {
      confirmPaid.mockResolvedValue('unchanged');
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.applyWebhookEvent(paymentEvent('payment.succeeded'));

      expect(logError).not.toHaveBeenCalled();
    });
  });

  describe('a session that ended unpaid', () => {
    it('closes a declined attempt, leaving the order open for another card', async () => {
      await service.applyWebhookEvent(paymentEvent('payment.failed'));

      expect(closeAttempt).toHaveBeenCalledWith(
        { id: 'delivery-1', type: 'payment.failed' },
        'payment-1',
        'FAILED',
      );
      expect(cancelUnpaid).not.toHaveBeenCalled();
    });

    it('cancels the order when the last attempt allowed is declined', async () => {
      findReportedAttempt.mockResolvedValue(LAST_ATTEMPT);

      await service.applyWebhookEvent(paymentEvent('payment.failed'));

      expect(cancelUnpaid).toHaveBeenCalledWith(
        { id: 'delivery-1', type: 'payment.failed' },
        {
          orderId: 'order-1',
          closing: { attemptId: 'payment-1', status: 'FAILED' },
          source: 'dominaite',
        },
      );
      expect(closeAttempt).not.toHaveBeenCalled();
    });

    it.each([
      ['payment.abandoned', 'ABANDONED'],
      ['payment.cancelled', 'CANCELLED'],
    ])('cancels the order on %s', async (type, status) => {
      await service.applyWebhookEvent(paymentEvent(type));

      expect(cancelUnpaid).toHaveBeenCalledWith(
        { id: 'delivery-1', type },
        {
          orderId: 'order-1',
          closing: { attemptId: 'payment-1', status },
          source: 'dominaite',
        },
      );
    });
  });

  it.each(['payment.refunded', 'payment.disputed', 'agreement.activated'])(
    'ignores %s',
    async (type) => {
      await service.applyWebhookEvent(paymentEvent(type));

      expect(findReportedAttempt).not.toHaveBeenCalled();
      expect(confirmPaid).not.toHaveBeenCalled();
      expect(closeAttempt).not.toHaveBeenCalled();
      expect(cancelUnpaid).not.toHaveBeenCalled();
    },
  );

  it('ignores a payment that is none of ours', async () => {
    findReportedAttempt.mockResolvedValue(null);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await service.applyWebhookEvent(paymentEvent('payment.succeeded'));

    expect(confirmPaid).not.toHaveBeenCalled();
  });

  describe('applySessionState: the sweep’s read', () => {
    const beforeExpiry = new Date('2026-10-23T11:00:00Z');

    it('confirms a paid session, with no delivery to record', async () => {
      await service.applySessionState(
        ATTEMPT,
        sessionState('succeeded', { isPaid: true, isTerminal: true }),
        beforeExpiry,
      );

      expect(confirmPaid).toHaveBeenCalledWith(null, ATTEMPT);
    });

    it('leaves the order unpaid when the session took another amount', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await service.applySessionState(
        ATTEMPT,
        {
          ...sessionState('succeeded', { isPaid: true, isTerminal: true }),
          amount: 100,
        },
        beforeExpiry,
      );

      expect(confirmPaid).not.toHaveBeenCalled();
    });

    it('cancels the order on a session Dominaite says was abandoned', async () => {
      await service.applySessionState(
        ATTEMPT,
        sessionState('abandoned', { isPaid: false, isTerminal: true }),
        beforeExpiry,
      );

      expect(cancelUnpaid).toHaveBeenCalledWith(null, {
        orderId: 'order-1',
        closing: { attemptId: 'payment-1', status: 'ABANDONED' },
        source: 'dominaite',
      });
    });

    it('closes a declined session, leaving the order open for another card', async () => {
      await service.applySessionState(
        ATTEMPT,
        sessionState('failed', { isPaid: false, isTerminal: true }),
        beforeExpiry,
      );

      expect(closeAttempt).toHaveBeenCalledWith(null, 'payment-1', 'FAILED');
    });

    it.each([
      ['inside its session', beforeExpiry],
      [
        'just past it, while a payment approved at the last moment may still land',
        new Date('2026-10-23T12:14:00Z'),
      ],
    ])('leaves a pending session open %s', async (_case, now) => {
      await service.applySessionState(ATTEMPT, PENDING, now);

      expect(confirmPaid).not.toHaveBeenCalled();
      expect(closeAttempt).not.toHaveBeenCalled();
      expect(cancelUnpaid).not.toHaveBeenCalled();
    });

    it('gives the order up once the grace past its session has run out', async () => {
      await service.applySessionState(
        ATTEMPT,
        PENDING,
        new Date('2026-10-23T12:16:00Z'),
      );

      expect(cancelUnpaid).toHaveBeenCalledWith(null, {
        orderId: 'order-1',
        closing: { attemptId: 'payment-1', status: 'ABANDONED' },
        source: 'shop',
      });
    });

    // The funds are held, not lost: never an abandoned order.
    it('keeps a session awaiting capture open, however late', async () => {
      await service.applySessionState(
        ATTEMPT,
        sessionState('requires_capture', { isPaid: false, isTerminal: false }),
        beforeExpiry,
      );

      expect(cancelUnpaid).not.toHaveBeenCalled();
    });
  });

  describe('cancelUnpaid', () => {
    const CANCELLATION = {
      orderId: 'order-1',
      closing: null,
      source: 'shop' as const,
    };

    it('answers what the cancellation did', async () => {
      cancelUnpaid.mockResolvedValue('unchanged');

      await expect(service.cancelUnpaid(CANCELLATION)).resolves.toBe(
        'unchanged',
      );
      expect(cancelUnpaid).toHaveBeenCalledWith(null, CANCELLATION);
    });
  });

  it.each([
    ['failed', 'FAILED'],
    ['abandoned', 'ABANDONED'],
    ['cancelled', 'CANCELLED'],
    ['refunded', 'CANCELLED'],
  ])('reads Dominaite’s terminal %s as an attempt %s', (status, expected) => {
    expect(endedStatusOf(status)).toBe(expected);
  });
});
