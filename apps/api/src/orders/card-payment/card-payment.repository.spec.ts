import { Test } from '@nestjs/testing';
import { OutboxRepository } from '../../events';
import { PrismaService } from '../../prisma';
import { CardPaymentRepository } from './card-payment.repository';

const EXPIRES_AT = new Date('2026-10-23T12:00:00Z');

const DELIVERY = { id: 'delivery-1', type: 'payment.succeeded' };

const ATTEMPT = {
  id: 'payment-1',
  orderId: 'order-1',
  orderReference: 'VP-ORD-000123',
  attempt: 1,
  transactionId: 'tx-1',
  expiresAt: EXPIRES_AT,
  orderStatus: 'PENDING_PAYMENT' as const,
  orderTotal: 4845,
};

const ATTEMPT_ROW = {
  id: 'payment-1',
  orderId: 'order-1',
  attempt: 1,
  transactionId: 'tx-1',
  expiresAt: EXPIRES_AT,
  order: {
    orderReference: 'VP-ORD-000123',
    status: 'PENDING_PAYMENT',
    total: 4845,
  },
};

const LATEST_ATTEMPT = {
  id: 'payment-2',
  attempt: 2,
  status: 'FAILED',
  transactionId: 'tx-2',
  expiresAt: EXPIRES_AT,
};

const ORDER_ROW = {
  id: 'order-1',
  orderReference: 'VP-ORD-000123',
  status: 'PENDING_PAYMENT',
  total: 4845,
  createdAt: new Date('2026-10-23T10:00:00Z'),
  contactFirstName: 'Иван',
  contactLastName: 'Петров',
  contactEmail: 'ivan@example.com',
  contactPhone: '+359888123456',
  cardPayments: [LATEST_ATTEMPT],
};

describe('CardPaymentRepository', () => {
  let repository: CardPaymentRepository;

  const append = jest.fn();

  const tx = {
    paymentWebhookEvent: { createMany: jest.fn() },
    cardPayment: { updateMany: jest.fn() },
    order: { updateMany: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    $queryRaw: jest.fn(),
    order: { findFirst: jest.fn(), findMany: jest.fn() },
    cardPayment: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.paymentWebhookEvent.createMany.mockResolvedValue({ count: 1 });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.cardPayment.updateMany.mockResolvedValue({ count: 1 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CardPaymentRepository,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxRepository, useValue: { append } },
      ],
    }).compile();

    repository = moduleRef.get(CardPaymentRepository);
  });

  describe('findOwnedOrder', () => {
    it('reads the order only together with its owner, with its latest attempt', async () => {
      prisma.order.findFirst.mockResolvedValue(ORDER_ROW);

      await expect(
        repository.findOwnedOrder('VP-ORD-000123', 'customer-1'),
      ).resolves.toEqual({
        id: 'order-1',
        orderReference: 'VP-ORD-000123',
        status: 'PENDING_PAYMENT',
        total: 4845,
        createdAt: ORDER_ROW.createdAt,
        payer: {
          firstName: 'Иван',
          lastName: 'Петров',
          email: 'ivan@example.com',
          phone: '+359888123456',
        },
        latestAttempt: LATEST_ATTEMPT,
      });

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderReference: 'VP-ORD-000123', customerId: 'customer-1' },
        }),
      );
      expect(
        prisma.order.findFirst.mock.calls[0][0].select.cardPayments,
      ).toMatchObject({ orderBy: { attempt: 'desc' }, take: 1 });
    });

    it('answers an order with no attempt yet', async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...ORDER_ROW,
        cardPayments: [],
      });

      await expect(
        repository.findOwnedOrder('VP-ORD-000123', 'customer-1'),
      ).resolves.toMatchObject({ latestAttempt: null });
    });

    it('answers null for no such order', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        repository.findOwnedOrder('VP-ORD-000123', 'customer-1'),
      ).resolves.toBeNull();
    });
  });

  it('records an opened session once, however often the same attempt is reopened', async () => {
    await repository.recordOpened('order-1', 1, {
      transactionId: 'tx-1',
      cashierKey: 'ck_51f0c2',
      cashierToken: 'token',
      amount: 4845,
      currency: 'EUR',
      expiresAt: EXPIRES_AT,
    });

    expect(prisma.cardPayment.createMany).toHaveBeenCalledWith({
      data: [
        {
          orderId: 'order-1',
          attempt: 1,
          transactionId: 'tx-1',
          amount: 4845,
          currency: 'EUR',
          expiresAt: EXPIRES_AT,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('marks an attempt failed only while it is still open', async () => {
    await repository.markFailed('order-1', 1);

    expect(prisma.cardPayment.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', attempt: 1, status: 'OPEN' },
      data: { status: 'FAILED' },
    });
  });

  describe('findReportedAttempt', () => {
    it('reads the attempt by its transaction, with what its order must be paid', async () => {
      prisma.cardPayment.findUnique.mockResolvedValue(ATTEMPT_ROW);

      await expect(repository.findReportedAttempt('tx-1')).resolves.toEqual(
        ATTEMPT,
      );
      expect(prisma.cardPayment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { transactionId: 'tx-1' } }),
      );
    });

    it('answers null for a transaction that is not ours', async () => {
      prisma.cardPayment.findUnique.mockResolvedValue(null);

      await expect(repository.findReportedAttempt('tx-9')).resolves.toBeNull();
    });
  });

  describe('claimAttemptsDue', () => {
    const NOW = new Date('2026-10-24T10:00:00Z');
    const claim = { now: NOW, limit: 20, leaseMs: 5 * 60_000 };

    it('leases the open attempts due, moving their next check on, in one statement', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'payment-1' }]);
      prisma.cardPayment.findMany.mockResolvedValue([ATTEMPT_ROW]);

      await expect(repository.claimAttemptsDue(claim)).resolves.toEqual([
        ATTEMPT,
      ]);

      const [sql, ...values] = prisma.$queryRaw.mock.calls[0] as [
        string[],
        ...unknown[],
      ];
      const text = sql.join('?');
      expect(text).toContain(`status = 'OPEN'`);
      expect(text).toContain('FOR UPDATE SKIP LOCKED');
      expect(values).toContain(20);
      expect(JSON.stringify(values)).toContain('2026-10-24T10:05:00.000Z');
      expect(prisma.cardPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['payment-1'] } } }),
      );
    });

    it('reads nothing more when none is due', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(repository.claimAttemptsDue(claim)).resolves.toEqual([]);
      expect(prisma.cardPayment.findMany).not.toHaveBeenCalled();
    });
  });

  it('finds the orders waiting on a payment no session can make any more', async () => {
    prisma.order.findMany.mockResolvedValue([{ id: 'order-1' }]);
    const now = new Date('2026-10-24T10:00:00Z');
    const placedBefore = new Date('2026-10-24T08:00:00Z');

    await expect(
      repository.findLapsedOrders({
        now,
        placedBefore,
        maxAttempts: 5,
        limit: 50,
      }),
    ).resolves.toEqual(['order-1']);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PENDING_PAYMENT',
          OR: [
            {
              createdAt: { lt: placedBefore },
              cardPayments: {
                none: { OR: [{ status: 'OPEN' }, { expiresAt: { gt: now } }] },
              },
            },
            {
              cardPayments: {
                some: { attempt: { gte: 5 }, status: 'FAILED' },
              },
            },
          ],
        },
        take: 50,
      }),
    );
  });

  describe('confirmPaid', () => {
    it('records the delivery, and pays the order and announces it in the same transaction', async () => {
      await expect(repository.confirmPaid(DELIVERY, ATTEMPT)).resolves.toBe(
        'applied',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.paymentWebhookEvent.createMany).toHaveBeenCalledWith({
        data: [DELIVERY],
        skipDuplicates: true,
      });
      expect(tx.cardPayment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: { not: 'SUCCEEDED' } },
        data: { status: 'SUCCEEDED' },
      });
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: 'PENDING_PAYMENT' },
        data: { status: 'PROCESSING', paymentReference: 'tx-1' },
      });
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: { orderId: 'order-1', status: 'PROCESSING', source: 'dominaite' },
      });
      expect(append).toHaveBeenCalledWith(tx, {
        type: 'OrderPlaced',
        payload: { orderId: 'order-1' },
      });
    });

    it('pays the order from the sweep’s read, which has no delivery to record', async () => {
      await expect(repository.confirmPaid(null, ATTEMPT)).resolves.toBe(
        'applied',
      );

      expect(tx.paymentWebhookEvent.createMany).not.toHaveBeenCalled();
      expect(tx.order.updateMany).toHaveBeenCalled();
    });

    it('changes nothing for an attempt already paid', async () => {
      tx.cardPayment.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.confirmPaid(DELIVERY, ATTEMPT)).resolves.toBe(
        'unchanged',
      );

      expect(tx.order.updateMany).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });

    it('writes the payment up to be given back when its order no longer waits for it', async () => {
      tx.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.confirmPaid(DELIVERY, ATTEMPT)).resolves.toBe(
        'refund-due',
      );

      expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
      expect(append).toHaveBeenCalledTimes(1);
      expect(append).toHaveBeenCalledWith(tx, {
        type: 'CardPaymentRefundDue',
        payload: {
          orderId: 'order-1',
          orderReference: 'VP-ORD-000123',
          transactionId: 'tx-1',
        },
      });
    });

    it('changes nothing for a delivery already handled', async () => {
      tx.paymentWebhookEvent.createMany.mockResolvedValue({ count: 0 });

      await expect(repository.confirmPaid(DELIVERY, ATTEMPT)).resolves.toBe(
        'duplicate',
      );

      expect(tx.cardPayment.updateMany).not.toHaveBeenCalled();
      expect(tx.order.updateMany).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });
  });

  describe('closeAttempt', () => {
    const FAILED_DELIVERY = { id: 'delivery-2', type: 'payment.failed' };

    it('records the delivery and closes the attempt only while it is open', async () => {
      await expect(
        repository.closeAttempt(FAILED_DELIVERY, 'payment-1', 'FAILED'),
      ).resolves.toBe('applied');

      expect(tx.paymentWebhookEvent.createMany).toHaveBeenCalledWith({
        data: [FAILED_DELIVERY],
        skipDuplicates: true,
      });
      expect(tx.cardPayment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: 'OPEN' },
        data: { status: 'FAILED' },
      });
    });

    it('answers unchanged for an attempt already closed', async () => {
      tx.cardPayment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.closeAttempt(FAILED_DELIVERY, 'payment-1', 'ABANDONED'),
      ).resolves.toBe('unchanged');
    });

    it('changes nothing for a delivery already handled', async () => {
      tx.paymentWebhookEvent.createMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.closeAttempt(FAILED_DELIVERY, 'payment-1', 'FAILED'),
      ).resolves.toBe('duplicate');
      expect(tx.cardPayment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('cancelUnpaid', () => {
    const ABANDONED_DELIVERY = { id: 'delivery-3', type: 'payment.abandoned' };
    const CANCELLATION = {
      orderId: 'order-1',
      closing: { attemptId: 'payment-1', status: 'ABANDONED' as const },
      source: 'dominaite' as const,
    };

    it('closes the attempt and cancels the order, together', async () => {
      await expect(
        repository.cancelUnpaid(ABANDONED_DELIVERY, CANCELLATION),
      ).resolves.toBe('applied');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.paymentWebhookEvent.createMany).toHaveBeenCalledWith({
        data: [ABANDONED_DELIVERY],
        skipDuplicates: true,
      });
      expect(tx.cardPayment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: 'OPEN' },
        data: { status: 'ABANDONED' },
      });
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: { orderId: 'order-1', status: 'CANCELLED', source: 'dominaite' },
      });
    });

    // A late report of an earlier session must not end the order a later
    // session is paying, and a paid order is never cancelled.
    it('cancels only an order waiting for its payment with no session open or paid', async () => {
      await repository.cancelUnpaid(null, CANCELLATION);

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          status: 'PENDING_PAYMENT',
          cardPayments: { none: { status: { in: ['OPEN', 'SUCCEEDED'] } } },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        tx.cardPayment.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(tx.order.updateMany.mock.invocationCallOrder[0]);
    });

    it('cancels an order with no open attempt, closing none', async () => {
      await repository.cancelUnpaid(null, {
        orderId: 'order-1',
        closing: null,
        source: 'shop',
      });

      expect(tx.cardPayment.updateMany).not.toHaveBeenCalled();
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: { orderId: 'order-1', status: 'CANCELLED', source: 'shop' },
      });
    });

    it('changes nothing more when the order cannot be cancelled', async () => {
      tx.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.cancelUnpaid(null, CANCELLATION)).resolves.toBe(
        'unchanged',
      );

      expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
    });

    it('changes nothing for a delivery already handled', async () => {
      tx.paymentWebhookEvent.createMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.cancelUnpaid(ABANDONED_DELIVERY, CANCELLATION),
      ).resolves.toBe('duplicate');
      expect(tx.order.updateMany).not.toHaveBeenCalled();
    });
  });
});
