import { Test } from '@nestjs/testing';
import { OutboxRepository } from '../../events';
import { PrismaService } from '../../prisma';
import { CardPaymentRepository } from './card-payment.repository';

const EXPIRES_AT = new Date('2026-10-23T12:00:00Z');

const DELIVERY = { id: 'delivery-1', type: 'payment.succeeded' };

const ATTEMPT = {
  id: 'payment-1',
  orderId: 'order-1',
  transactionId: 'tx-1',
  orderStatus: 'PENDING_PAYMENT' as const,
  orderTotal: 4845,
};

const ORDER_ROW = {
  id: 'order-1',
  orderReference: 'VP-ORD-000123',
  status: 'PENDING_PAYMENT',
  total: 4845,
  contactFirstName: 'Иван',
  contactLastName: 'Петров',
  contactEmail: 'ivan@example.com',
  contactPhone: '+359888123456',
  cardPayments: [{ attempt: 2, status: 'FAILED', expiresAt: EXPIRES_AT }],
};

describe('CardPaymentRepository', () => {
  let repository: CardPaymentRepository;

  const append = jest.fn();

  const tx = {
    paymentWebhookEvent: { createMany: jest.fn() },
    cardPayment: { update: jest.fn(), updateMany: jest.fn() },
    order: { updateMany: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    order: { findFirst: jest.fn() },
    cardPayment: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
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
        payer: {
          firstName: 'Иван',
          lastName: 'Петров',
          email: 'ivan@example.com',
          phone: '+359888123456',
        },
        latestAttempt: { attempt: 2, status: 'FAILED', expiresAt: EXPIRES_AT },
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
      prisma.cardPayment.findUnique.mockResolvedValue({
        id: 'payment-1',
        orderId: 'order-1',
        transactionId: 'tx-1',
        order: { status: 'PENDING_PAYMENT', total: 4845 },
      });

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
      expect(tx.cardPayment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
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

    it('announces nothing again for an order no longer waiting for its payment', async () => {
      tx.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.confirmPaid(DELIVERY, ATTEMPT)).resolves.toBe(
        'unchanged',
      );

      expect(tx.cardPayment.update).toHaveBeenCalled();
      expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });

    it('changes nothing for a delivery already handled', async () => {
      tx.paymentWebhookEvent.createMany.mockResolvedValue({ count: 0 });

      await expect(repository.confirmPaid(DELIVERY, ATTEMPT)).resolves.toBe(
        'duplicate',
      );

      expect(tx.cardPayment.update).not.toHaveBeenCalled();
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
});
