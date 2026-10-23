import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma';
import { CardPaymentRepository } from './card-payment.repository';

const EXPIRES_AT = new Date('2026-10-23T12:00:00Z');

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

  const prisma = {
    order: { findFirst: jest.fn() },
    cardPayment: { createMany: jest.fn(), updateMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CardPaymentRepository,
        { provide: PrismaService, useValue: prisma },
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
});
