import { Test } from '@nestjs/testing';
import { CustomersService } from '../../customers';
import {
  CheckoutKeySpentError,
  DominaiteGateway,
  OpenedCheckoutSession,
  PaymentUnavailableException,
} from '../../payments';
import {
  OrderNotFoundException,
  OrderNotPayableException,
  OrderPaymentProcessingException,
} from '../orders.exceptions';
import { CardPaymentRepository, PayableOrder } from './card-payment.repository';
import {
  CardPaymentService,
  MAX_PAYMENT_ATTEMPTS,
} from './card-payment.service';

const NOW = new Date('2026-10-23T10:00:00Z');
const CLERK_ID = 'clerk-1';
const REFERENCE = 'VP-ORD-000123';

const PAYER = {
  firstName: 'Иван',
  lastName: 'Петров',
  email: 'ivan@example.com',
  phone: '+359888123456',
};

const SESSION: OpenedCheckoutSession = {
  transactionId: '3f6c1a2e-8b4d-4c1f-9a7e-5d2b0c9e41a7',
  cashierKey: 'ck_51f0c2',
  cashierToken: 'b7d94e10-2a6f-4c3b-8e51-0f9d7a3c6b28',
  amount: 4845,
  currency: 'EUR',
  expiresAt: new Date('2026-10-23T12:00:00Z'),
};

function payableOrder(overrides: Partial<PayableOrder> = {}): PayableOrder {
  return {
    id: 'order-1',
    orderReference: REFERENCE,
    status: 'PENDING_PAYMENT',
    total: 4845,
    payer: PAYER,
    latestAttempt: null,
    ...overrides,
  };
}

describe('CardPaymentService', () => {
  let service: CardPaymentService;
  let order: PayableOrder | null;

  const findByClerkId = jest.fn();
  const findOwnedOrder = jest.fn();
  const recordOpened = jest.fn();
  const markFailed = jest.fn();
  const openCheckoutSession = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: NOW });
    order = payableOrder();
    findByClerkId.mockResolvedValue({ id: 'customer-1' });
    findOwnedOrder.mockImplementation(() => Promise.resolve(order));
    openCheckoutSession.mockResolvedValue(SESSION);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CardPaymentService,
        { provide: CustomersService, useValue: { findByClerkId } },
        {
          provide: CardPaymentRepository,
          useValue: { findOwnedOrder, recordOpened, markFailed },
        },
        { provide: DominaiteGateway, useValue: { openCheckoutSession } },
      ],
    }).compile();

    service = moduleRef.get(CardPaymentService);
  });

  afterEach(() => jest.useRealTimers());

  const openPayment = () => service.openPayment(CLERK_ID, REFERENCE);

  it('opens the first session for the order’s own total and payer', async () => {
    await expect(openPayment()).resolves.toEqual({
      cashierKey: 'ck_51f0c2',
      cashierToken: 'b7d94e10-2a6f-4c3b-8e51-0f9d7a3c6b28',
      expiresAt: '2026-10-23T12:00:00.000Z',
    });

    expect(findOwnedOrder).toHaveBeenCalledWith(REFERENCE, 'customer-1');
    expect(openCheckoutSession).toHaveBeenCalledWith({
      orderReference: REFERENCE,
      attempt: 1,
      amount: 4845,
      customer: PAYER,
    });
    expect(recordOpened).toHaveBeenCalledWith('order-1', 1, SESSION);
  });

  it('answers the session still open, by asking for the same attempt again', async () => {
    order = payableOrder({
      latestAttempt: {
        attempt: 2,
        status: 'OPEN',
        expiresAt: new Date('2026-10-23T10:30:00Z'),
      },
    });

    await openPayment();

    expect(openCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2 }),
    );
  });

  it('opens the next attempt after one that failed', async () => {
    order = payableOrder({
      latestAttempt: {
        attempt: 1,
        status: 'FAILED',
        expiresAt: new Date('2026-10-23T11:00:00Z'),
      },
    });

    await openPayment();

    expect(openCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2 }),
    );
    expect(recordOpened).toHaveBeenCalledWith('order-1', 2, SESSION);
  });

  it('opens the next attempt when Dominaite says the open one’s payment failed', async () => {
    order = payableOrder({
      latestAttempt: {
        attempt: 1,
        status: 'OPEN',
        expiresAt: new Date('2026-10-23T11:00:00Z'),
      },
    });
    openCheckoutSession
      .mockRejectedValueOnce(new CheckoutKeySpentError('failed', 'tx-1'))
      .mockResolvedValueOnce(SESSION);

    await expect(openPayment()).resolves.toMatchObject({
      cashierKey: 'ck_51f0c2',
    });

    expect(markFailed).toHaveBeenCalledWith('order-1', 1);
    expect(openCheckoutSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 2 }),
    );
    expect(recordOpened).toHaveBeenCalledWith('order-1', 2, SESSION);
  });

  it('says the payment is being confirmed, opening nothing, when Dominaite says the order is paid', async () => {
    openCheckoutSession.mockRejectedValue(
      new CheckoutKeySpentError('paid', 'tx-1'),
    );

    await expect(openPayment()).rejects.toBeInstanceOf(
      OrderPaymentProcessingException,
    );
    expect(openCheckoutSession).toHaveBeenCalledTimes(1);
    expect(recordOpened).not.toHaveBeenCalled();
  });

  it('opens the last attempt allowed after one that failed', async () => {
    order = payableOrder({
      latestAttempt: {
        attempt: MAX_PAYMENT_ATTEMPTS - 1,
        status: 'FAILED',
        expiresAt: new Date('2026-10-23T11:00:00Z'),
      },
    });

    await openPayment();

    expect(openCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: MAX_PAYMENT_ATTEMPTS }),
    );
  });

  it('refuses another attempt once the last one allowed has failed', async () => {
    order = payableOrder({
      latestAttempt: {
        attempt: MAX_PAYMENT_ATTEMPTS,
        status: 'FAILED',
        expiresAt: new Date('2026-10-23T11:00:00Z'),
      },
    });

    await expect(openPayment()).rejects.toBeInstanceOf(
      OrderNotPayableException,
    );
    expect(openCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses another attempt when Dominaite says the last one allowed has failed', async () => {
    order = payableOrder({
      latestAttempt: {
        attempt: MAX_PAYMENT_ATTEMPTS,
        status: 'OPEN',
        expiresAt: new Date('2026-10-23T11:00:00Z'),
      },
    });
    openCheckoutSession.mockRejectedValue(
      new CheckoutKeySpentError('failed', 'tx-5'),
    );

    await expect(openPayment()).rejects.toBeInstanceOf(
      OrderNotPayableException,
    );
    expect(markFailed).toHaveBeenCalledWith('order-1', MAX_PAYMENT_ATTEMPTS);
    expect(openCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('refuses an order whose session has ended unpaid, so it is not paid after it lapsed', async () => {
    order = payableOrder({
      latestAttempt: { attempt: 1, status: 'OPEN', expiresAt: NOW },
    });

    await expect(openPayment()).rejects.toBeInstanceOf(
      OrderNotPayableException,
    );
    expect(openCheckoutSession).not.toHaveBeenCalled();
  });

  it.each(['SUCCEEDED', 'ABANDONED', 'CANCELLED'] as const)(
    'refuses an order whose last attempt is %s',
    async (status) => {
      order = payableOrder({
        latestAttempt: {
          attempt: 1,
          status,
          expiresAt: new Date('2026-10-23T11:00:00Z'),
        },
      });

      await expect(openPayment()).rejects.toBeInstanceOf(
        OrderNotPayableException,
      );
      expect(openCheckoutSession).not.toHaveBeenCalled();
    },
  );

  it.each(['PROCESSING', 'CANCELLED', 'AWAITING_CONFIRMATION'] as const)(
    'refuses an order that is %s, which waits for no payment',
    async (status) => {
      order = payableOrder({ status });

      await expect(openPayment()).rejects.toBeInstanceOf(
        OrderNotPayableException,
      );
      expect(openCheckoutSession).not.toHaveBeenCalled();
    },
  );

  it('answers 404 for an order that is not the customer’s', async () => {
    order = null;

    await expect(openPayment()).rejects.toBeInstanceOf(OrderNotFoundException);
  });

  it('answers 404 for a signed-in visitor who is not a customer yet', async () => {
    findByClerkId.mockResolvedValue(null);

    await expect(openPayment()).rejects.toBeInstanceOf(OrderNotFoundException);
    expect(findOwnedOrder).not.toHaveBeenCalled();
  });

  it('records nothing when Dominaite cannot be reached', async () => {
    openCheckoutSession.mockRejectedValue(new PaymentUnavailableException());

    await expect(openPayment()).rejects.toBeInstanceOf(
      PaymentUnavailableException,
    );
    expect(recordOpened).not.toHaveBeenCalled();
  });
});
