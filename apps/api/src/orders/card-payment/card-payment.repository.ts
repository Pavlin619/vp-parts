import { Injectable } from '@nestjs/common';
import { OutboxRepository } from '../../events';
import { CardPaymentStatus, OrderStatus, Prisma } from '../../generated/prisma';
import type { CheckoutPayer, OpenedCheckoutSession } from '../../payments';
import { PrismaService, utcTimestamp } from '../../prisma';
import { ORDER_PLACED, OrderPlacedPayload } from '../order-placed.event';
import {
  CARD_PAYMENT_REFUND_DUE,
  CardPaymentRefundDuePayload,
} from './card-payment-refund-due.event';

export interface PaymentAttempt {
  id: string;
  attempt: number;
  status: CardPaymentStatus;
  transactionId: string;
  expiresAt: Date;
}

/** What opening a card order's payment reads: the order, and its latest attempt. */
export interface PayableOrder {
  id: string;
  orderReference: string;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  payer: CheckoutPayer;
  latestAttempt: PaymentAttempt | null;
}

/** An attempt Dominaite reported on, or the sweep read, with what its order must be paid. */
export interface ReportedAttempt {
  id: string;
  orderId: string;
  orderReference: string;
  attempt: number;
  transactionId: string;
  expiresAt: Date;
  orderStatus: OrderStatus;
  orderTotal: number;
}

export interface WebhookDelivery {
  id: string;
  type: string;
}

/** What a change did; `duplicate` when its delivery had been handled already. */
export type DeliveryEffect = 'applied' | 'unchanged' | 'duplicate';

/** `refund-due`: the payment arrived once its order no longer waited for it. */
export type ConfirmationEffect = DeliveryEffect | 'refund-due';

/** Who ended the order: Dominaite's report, or the shop giving up on it. */
export type CancellationSource = 'dominaite' | 'shop';

export interface UnpaidCancellation {
  orderId: string;
  /** The open attempt that ends with the order, and how it ended. */
  closing: { attemptId: string; status: CardPaymentStatus } | null;
  source: CancellationSource;
}

export interface DueAttemptsClaim {
  now: Date;
  limit: number;
  /** How long the claim holds, which is also when the session is read again. */
  leaseMs: number;
}

export interface LapsedOrdersQuery {
  now: Date;
  /** An order with no attempt yet, placed before this, is held no longer. */
  placedBefore: Date;
  maxAttempts: number;
  limit: number;
}

const PAYMENT_SOURCE = 'dominaite';

const paymentAttempt = {
  id: true,
  attempt: true,
  status: true,
  transactionId: true,
  expiresAt: true,
} satisfies Prisma.CardPaymentSelect;

const payableOrder = {
  id: true,
  orderReference: true,
  status: true,
  total: true,
  createdAt: true,
  contactFirstName: true,
  contactLastName: true,
  contactEmail: true,
  contactPhone: true,
  cardPayments: {
    orderBy: { attempt: 'desc' },
    take: 1,
    select: paymentAttempt,
  },
} satisfies Prisma.OrderSelect;

const reportedAttempt = {
  id: true,
  orderId: true,
  attempt: true,
  transactionId: true,
  expiresAt: true,
  order: { select: { orderReference: true, status: true, total: true } },
} satisfies Prisma.CardPaymentSelect;

type PayableOrderRow = Prisma.OrderGetPayload<{
  select: typeof payableOrder;
}>;

type ReportedAttemptRow = Prisma.CardPaymentGetPayload<{
  select: typeof reportedAttempt;
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
      select: reportedAttempt,
    });

    return row ? toReportedAttempt(row) : null;
  }

  /**
   * Leases open attempts whose next check is due, and sets the one after. One
   * statement, so its row locks end with it and none is held while Dominaite
   * is asked; another instance skips what this one claimed.
   */
  async claimAttemptsDue({
    now,
    limit,
    leaseMs,
  }: DueAttemptsClaim): Promise<ReportedAttempt[]> {
    const nextCheckAt = new Date(now.getTime() + leaseMs);

    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "CardPayment"
      SET "nextCheckAt" = ${utcTimestamp(nextCheckAt)}
      WHERE id IN (
        SELECT id FROM "CardPayment"
        WHERE status = 'OPEN' AND "nextCheckAt" <= ${utcTimestamp(now)}
        ORDER BY "nextCheckAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;

    if (claimed.length === 0) {
      return [];
    }

    const rows = await this.prisma.cardPayment.findMany({
      where: { id: { in: claimed.map(({ id }) => id) } },
      select: reportedAttempt,
    });

    return rows.map(toReportedAttempt);
  }

  /**
   * Card orders that no session can pay any more, with nothing to ask Dominaite:
   * every attempt is closed and the last one's time is up, or none was opened
   * in time, or the last attempt allowed was declined.
   */
  async findLapsedOrders({
    now,
    placedBefore,
    maxAttempts,
    limit,
  }: LapsedOrdersQuery): Promise<string[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        OR: [
          {
            createdAt: { lt: placedBefore },
            cardPayments: {
              none: {
                OR: [
                  { status: CardPaymentStatus.OPEN },
                  { expiresAt: { gt: now } },
                ],
              },
            },
          },
          {
            cardPayments: {
              some: {
                attempt: { gte: maxAttempts },
                status: CardPaymentStatus.FAILED,
              },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return rows.map(({ id }) => id);
  }

  /**
   * Marks the attempt paid and, if the order still waits for its payment,
   * moves it on and writes its `OrderPlaced`, so the emails and the backoffice
   * hear of it exactly once. A payment its order no longer waits for is
   * written up to be given back.
   */
  confirmPaid(
    delivery: WebhookDelivery | null,
    attempt: ReportedAttempt,
  ): Promise<ConfirmationEffect> {
    return this.onceFor(delivery, async (tx) => {
      const paid = await tx.cardPayment.updateMany({
        where: { id: attempt.id, status: { not: CardPaymentStatus.SUCCEEDED } },
        data: { status: CardPaymentStatus.SUCCEEDED },
      });

      if (paid.count === 0) {
        return 'unchanged';
      }

      const { count } = await tx.order.updateMany({
        where: { id: attempt.orderId, status: OrderStatus.PENDING_PAYMENT },
        data: {
          status: OrderStatus.PROCESSING,
          paymentReference: attempt.transactionId,
        },
      });

      if (count === 0) {
        await this.appendRefundDue(tx, attempt);
        return 'refund-due';
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

      return 'applied';
    });
  }

  closeAttempt(
    delivery: WebhookDelivery | null,
    attemptId: string,
    status: CardPaymentStatus,
  ): Promise<DeliveryEffect> {
    return this.onceFor(delivery, async (tx) => {
      const { count } = await tx.cardPayment.updateMany({
        where: { id: attemptId, status: CardPaymentStatus.OPEN },
        data: { status },
      });

      return count === 1 ? 'applied' : 'unchanged';
    });
  }

  /**
   * Cancels a card order that ended unpaid, closing its open attempt. Never
   * while another attempt is open or one has been paid: a late report of an old
   * session ends nothing.
   */
  async cancelUnpaid(
    delivery: WebhookDelivery | null,
    { orderId, closing, source }: UnpaidCancellation,
  ): Promise<DeliveryEffect> {
    return this.onceFor(delivery, async (tx) => {
      if (closing) {
        await tx.cardPayment.updateMany({
          where: { id: closing.attemptId, status: CardPaymentStatus.OPEN },
          data: { status: closing.status },
        });
      }

      const { count } = await tx.order.updateMany({
        where: {
          id: orderId,
          status: OrderStatus.PENDING_PAYMENT,
          cardPayments: {
            none: {
              status: {
                in: [CardPaymentStatus.OPEN, CardPaymentStatus.SUCCEEDED],
              },
            },
          },
        },
        data: { status: OrderStatus.CANCELLED },
      });

      if (count === 0) {
        return 'unchanged';
      }

      await tx.orderStatusHistory.create({
        data: { orderId, status: OrderStatus.CANCELLED, source },
      });

      return 'applied';
    });
  }

  private async appendRefundDue(
    tx: Prisma.TransactionClient,
    attempt: ReportedAttempt,
  ): Promise<void> {
    await this.outbox.append(tx, {
      type: CARD_PAYMENT_REFUND_DUE,
      payload: {
        orderId: attempt.orderId,
        orderReference: attempt.orderReference,
        transactionId: attempt.transactionId,
      } satisfies CardPaymentRefundDuePayload,
    });
  }

  /**
   * Records the delivery and makes its change in one transaction, or neither.
   * The sweep's reads have no delivery, and are guarded by the change alone.
   */
  private onceFor<Effect extends string>(
    delivery: WebhookDelivery | null,
    change: (tx: Prisma.TransactionClient) => Promise<Effect>,
  ): Promise<Effect | 'duplicate'> {
    return this.prisma.$transaction(async (tx) => {
      if (delivery && !(await isFirstDelivery(tx, delivery))) {
        return 'duplicate';
      }

      return change(tx);
    });
  }
}

async function isFirstDelivery(
  tx: Prisma.TransactionClient,
  delivery: WebhookDelivery,
): Promise<boolean> {
  const { count } = await tx.paymentWebhookEvent.createMany({
    data: [delivery],
    skipDuplicates: true,
  });

  return count === 1;
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

function toReportedAttempt({
  order,
  ...attempt
}: ReportedAttemptRow): ReportedAttempt {
  return {
    ...attempt,
    orderReference: order.orderReference,
    orderStatus: order.status,
    orderTotal: order.total,
  };
}
