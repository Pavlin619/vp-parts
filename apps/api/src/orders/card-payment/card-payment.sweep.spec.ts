import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CheckoutSessionState,
  DominaiteGateway,
  PaymentUnavailableException,
} from '../../payments';
import {
  CardPaymentRepository,
  ReportedAttempt,
} from './card-payment.repository';
import { MAX_PAYMENT_ATTEMPTS } from './card-payment.policy';
import { CardPaymentSweep } from './card-payment.sweep';
import { PaymentOutcomeService } from './payment-outcome.service';

const NOW = new Date('2026-10-24T10:00:00Z');

function attemptOf(id: string): ReportedAttempt {
  return {
    id,
    orderId: `order-of-${id}`,
    orderReference: 'VP-ORD-000123',
    attempt: 1,
    transactionId: `tx-of-${id}`,
    expiresAt: new Date('2026-10-24T11:00:00Z'),
    orderStatus: 'PENDING_PAYMENT',
    orderTotal: 4845,
  };
}

const PENDING: CheckoutSessionState = {
  transactionId: 'tx-of-payment-1',
  status: 'pending',
  amount: 4845,
  currency: 'EUR',
  isPaid: false,
  isTerminal: false,
};

describe('CardPaymentSweep', () => {
  let sweep: CardPaymentSweep;

  const claimAttemptsDue = jest.fn();
  const findLapsedOrders = jest.fn();
  const readCheckoutSession = jest.fn();
  const applySessionState = jest.fn();
  const cancelUnpaid = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: NOW });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    claimAttemptsDue.mockResolvedValue([]);
    findLapsedOrders.mockResolvedValue([]);
    readCheckoutSession.mockResolvedValue(PENDING);
    cancelUnpaid.mockResolvedValue('applied');

    const moduleRef = await Test.createTestingModule({
      providers: [
        CardPaymentSweep,
        {
          provide: CardPaymentRepository,
          useValue: { claimAttemptsDue, findLapsedOrders },
        },
        { provide: DominaiteGateway, useValue: { readCheckoutSession } },
        {
          provide: PaymentOutcomeService,
          useValue: { applySessionState, cancelUnpaid },
        },
      ],
    }).compile();

    sweep = moduleRef.get(CardPaymentSweep);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('open sessions', () => {
    it('leases a batch of the sessions due, to read again in five minutes', async () => {
      await sweep.sweep();

      expect(claimAttemptsDue).toHaveBeenCalledWith({
        now: NOW,
        limit: 20,
        leaseMs: 5 * 60_000,
      });
    });

    it('asks Dominaite about each, and applies what it says as the webhook would', async () => {
      claimAttemptsDue.mockResolvedValue([
        attemptOf('payment-1'),
        attemptOf('payment-2'),
      ]);

      await sweep.sweep();

      expect(readCheckoutSession.mock.calls).toEqual([
        ['tx-of-payment-1'],
        ['tx-of-payment-2'],
      ]);
      expect(applySessionState).toHaveBeenCalledWith(
        attemptOf('payment-1'),
        PENDING,
        NOW,
      );
      expect(applySessionState).toHaveBeenCalledTimes(2);
    });

    it('carries on past a session it could not apply', async () => {
      claimAttemptsDue.mockResolvedValue([
        attemptOf('payment-1'),
        attemptOf('payment-2'),
      ]);
      applySessionState.mockRejectedValueOnce(new Error('deadlock'));

      await sweep.sweep();

      expect(applySessionState).toHaveBeenCalledTimes(2);
    });

    // The rest of the batch stays leased, and is read on a later run.
    it('stops asking for the run once Dominaite cannot be reached', async () => {
      claimAttemptsDue.mockResolvedValue([
        attemptOf('payment-1'),
        attemptOf('payment-2'),
      ]);
      readCheckoutSession.mockRejectedValue(new PaymentUnavailableException());

      await sweep.sweep();

      expect(readCheckoutSession).toHaveBeenCalledTimes(1);
      expect(applySessionState).not.toHaveBeenCalled();
    });
  });

  describe('lapsed orders', () => {
    it('looks for orders past their hold, or out of attempts', async () => {
      await sweep.sweep();

      expect(findLapsedOrders).toHaveBeenCalledWith({
        now: NOW,
        placedBefore: new Date('2026-10-24T08:00:00Z'),
        maxAttempts: MAX_PAYMENT_ATTEMPTS,
        limit: 50,
      });
    });

    it('cancels each, as the shop giving up on it', async () => {
      findLapsedOrders.mockResolvedValue(['order-1', 'order-2']);

      await sweep.sweep();

      expect(cancelUnpaid.mock.calls).toEqual([
        [{ orderId: 'order-1', closing: null, source: 'shop' }],
        [{ orderId: 'order-2', closing: null, source: 'shop' }],
      ]);
    });

    it('carries on past an order it could not cancel', async () => {
      findLapsedOrders.mockResolvedValue(['order-1', 'order-2']);
      cancelUnpaid.mockRejectedValueOnce(new Error('unique violation'));

      await sweep.sweep();

      expect(cancelUnpaid).toHaveBeenCalledTimes(2);
    });

    it('still runs when Dominaite cannot be reached, since it asks Dominaite nothing', async () => {
      claimAttemptsDue.mockResolvedValue([attemptOf('payment-1')]);
      readCheckoutSession.mockRejectedValue(new PaymentUnavailableException());
      findLapsedOrders.mockResolvedValue(['order-1']);

      await sweep.sweep();

      expect(cancelUnpaid).toHaveBeenCalledTimes(1);
    });
  });

  it('runs one sweep at a time on an instance', async () => {
    let release: () => void = () => undefined;
    claimAttemptsDue.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve([]);
      }),
    );

    const first = sweep.sweep();
    await sweep.sweep();
    release();
    await first;

    expect(claimAttemptsDue).toHaveBeenCalledTimes(1);
  });
});
