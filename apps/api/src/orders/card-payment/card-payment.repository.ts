import { Injectable } from '@nestjs/common';
import { OutboxRepository } from '../../events';
import { CardPaymentStatus, OrderStatus, Prisma } from '../../generated/prisma';
import type { CheckoutPayer, OpenedCheckoutSession } from '../../payments';
import { PrismaService } from '../../prisma';
import { ORDER_PLACED, OrderPlacedPayload } from '../order-placed.event';

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

/** The attempt a payment Dominaite reported on belongs to, and what its order must be paid. */
export interface ReportedAttempt {
  id: string;
  orderId: string;
  transactionId: string;
  orderStatus: OrderStatus;
  orderTotal: number;
}

export interface WebhookDelivery {
  id: string;
  type: string;
}

/** What a delivery changed; `duplicate` when it had been handled already. */
export type DeliveryEffect = 'applied' | 'unchanged' | 'duplicate';

const PAYMENT_SOURCE = 'dominaite';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxRepository,
  ) {}

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

  async findReportedAttempt(
    transactionId: string,
  ): Promise<ReportedAttempt | null> {
    const row = await this.prisma.cardPayment.findUnique({
      where: { transactionId },
      select: {
        id: true,
        orderId: true,
        transactionId: true,
        order: { select: { status: true, total: true } },
      },
    });

    if (!row) {
      return null;
    }

    const { order, ...attempt } = row;

    return { ...attempt, orderStatus: order.status, orderTotal: order.total };
  }

  /**
   * Marks the attempt paid and, if the order still waits for its payment,
   * moves it on and writes its `OrderPlaced`, so the emails and the backoffice
   * hear of it exactly once.
   */
  confirmPaid(
    delivery: WebhookDelivery,
    attempt: ReportedAttempt,
  ): Promise<DeliveryEffect> {
    return this.onceForDelivery(delivery, async (tx) => {
      await tx.cardPayment.update({
        where: { id: attempt.id },
        data: { status: CardPaymentStatus.SUCCEEDED },
      });

      const { count } = await tx.order.updateMany({
        where: { id: attempt.orderId, status: OrderStatus.PENDING_PAYMENT },
        data: {
          status: OrderStatus.PROCESSING,
          paymentReference: attempt.transactionId,
        },
      });

      if (count === 0) {
        return false;
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: attempt.orderId,
          status: OrderStatus.PROCESSING,
          source: PAYMENT_SOURCE,
        },
      });
      await this.outbox.append(tx, {
        type: ORDER_PLACED,
        payload: { orderId: attempt.orderId } satisfies OrderPlacedPayload,
      });

      return true;
    });
  }

  closeAttempt(
    delivery: WebhookDelivery,
    attemptId: string,
    status: CardPaymentStatus,
  ): Promise<DeliveryEffect> {
    return this.onceForDelivery(delivery, async (tx) => {
      const { count } = await tx.cardPayment.updateMany({
        where: { id: attemptId, status: CardPaymentStatus.OPEN },
        data: { status },
      });

      return count === 1;
    });
  }

  /** Records the delivery and makes its change in one transaction, or neither. */
  private onceForDelivery(
    delivery: WebhookDelivery,
    change: (tx: Prisma.TransactionClient) => Promise<boolean>,
  ): Promise<DeliveryEffect> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.paymentWebhookEvent.createMany({
        data: [delivery],
        skipDuplicates: true,
      });

      if (count === 0) {
        return 'duplicate';
      }

      return (await change(tx)) ? 'applied' : 'unchanged';
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
