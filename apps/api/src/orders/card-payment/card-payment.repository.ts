import { Injectable } from '@nestjs/common';
import { CardPaymentStatus, OrderStatus, Prisma } from '../../generated/prisma';
import type { CheckoutPayer, OpenedCheckoutSession } from '../../payments';
import { PrismaService } from '../../prisma';

export interface PaymentAttempt {
  attempt: number;
  status: CardPaymentStatus;
  expiresAt: Date;
}

/** What opening a card order's payment reads: the order, and its latest attempt. */
export interface PayableOrder {
  id: string;
  orderReference: string;
  status: OrderStatus;
  total: number;
  payer: CheckoutPayer;
  latestAttempt: PaymentAttempt | null;
}

const payableOrder = {
  id: true,
  orderReference: true,
  status: true,
  total: true,
  contactFirstName: true,
  contactLastName: true,
  contactEmail: true,
  contactPhone: true,
  cardPayments: {
    orderBy: { attempt: 'desc' },
    take: 1,
    select: { attempt: true, status: true, expiresAt: true },
  },
} satisfies Prisma.OrderSelect;

type PayableOrderRow = Prisma.OrderGetPayload<{
  select: typeof payableOrder;
}>;

@Injectable()
export class CardPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOwnedOrder(
    orderReference: string,
    customerId: string,
  ): Promise<PayableOrder | null> {
    const row = await this.prisma.order.findFirst({
      where: { orderReference, customerId },
      select: payableOrder,
    });

    return row ? toPayableOrder(row) : null;
  }

  /** Reopening an attempt answers the session it already opened, so its row is kept. */
  async recordOpened(
    orderId: string,
    attempt: number,
    { transactionId, amount, currency, expiresAt }: OpenedCheckoutSession,
  ): Promise<void> {
    await this.prisma.cardPayment.createMany({
      data: [{ orderId, attempt, transactionId, amount, currency, expiresAt }],
      skipDuplicates: true,
    });
  }

  async markFailed(orderId: string, attempt: number): Promise<void> {
    await this.prisma.cardPayment.updateMany({
      where: { orderId, attempt, status: CardPaymentStatus.OPEN },
      data: { status: CardPaymentStatus.FAILED },
    });
  }
}

function toPayableOrder({
  cardPayments: [latestAttempt],
  contactFirstName,
  contactLastName,
  contactEmail,
  contactPhone,
  ...order
}: PayableOrderRow): PayableOrder {
  return {
    ...order,
    payer: {
      firstName: contactFirstName,
      lastName: contactLastName,
      email: contactEmail,
      phone: contactPhone,
    },
    latestAttempt: latestAttempt ?? null,
  };
}
