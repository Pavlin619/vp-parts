import { Injectable } from '@nestjs/common';
import type { OrderMoneyDto } from '@vp-parts-shop/shared';
import { CartRepository } from '../cart';
import type { DeliveryPrice } from '../delivery';
import { OutboxRepository } from '../events';
import {
  CartStatus,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '../generated/prisma';
import { PrismaService } from '../prisma';
import { ORDER_PLACED, OrderPlacedPayload } from './order-placed.event';

export interface NewOrderItem {
  brandId: string;
  articleNumber: string;
  brandName: string;
  description: string;
  thumbnailUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderContact {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
}

/** Everything an order freezes, read and checked before the transaction opens. */
export interface NewOrder {
  cartId: string;
  /** The version every check before the transaction was made against. */
  cartVersion: number;
  /** Null for a guest's quick order. */
  customerId: string | null;
  contact: OrderContact;
  items: NewOrderItem[];
  delivery: DeliveryPrice;
  money: OrderMoneyDto;
  paymentMethod: PaymentMethod;
  termsVersion: string;
  /** Also the order's first status-history row. */
  initialStatus: OrderStatus;
}

export interface OrderReference {
  id: string;
  orderReference: string;
}

export type OrderPlacement =
  | { kind: 'placed'; order: OrderReference }
  /** The cart was ordered from already, by this request's twin. */
  | { kind: 'replayed'; order: OrderReference }
  /** The cart moved after the checks were made. */
  | { kind: 'stale' };

const withDetail = {
  items: true,
  statusHistory: { orderBy: { occurredAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export type OrderRecord = Prisma.OrderGetPayload<{
  include: typeof withDetail;
}>;

const referenceOnly = {
  id: true,
  orderReference: true,
} satisfies Prisma.OrderSelect;

@Injectable()
export class OrdersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartRepository,
    private readonly outbox: OutboxRepository,
  ) {}

  /**
   * Writes the order, its `OrderPlaced` event and retires its cart in one
   * transaction, holding the cart's row lock throughout, so two requests for
   * one cart end in one order and one event.
   */
  place(order: NewOrder): Promise<OrderPlacement> {
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.carts.lockCart(tx, order.cartId);

      if (cart?.orderId) {
        return {
          kind: 'replayed',
          order: await tx.order.findUniqueOrThrow({
            where: { id: cart.orderId },
            select: referenceOnly,
          }),
        };
      }

      if (
        cart?.status !== CartStatus.ACTIVE ||
        cart.version !== order.cartVersion
      ) {
        return { kind: 'stale' };
      }

      const placed = await tx.order.create({
        data: toOrderData(order, await nextOrderReference(tx)),
        select: referenceOnly,
      });

      await this.outbox.append(tx, {
        type: ORDER_PLACED,
        payload: { orderId: placed.id } satisfies OrderPlacedPayload,
      });

      await this.carts.closeForOrder(tx, {
        cartId: order.cartId,
        orderId: placed.id,
        customerId: order.customerId,
        token: cart.token,
      });

      return { kind: 'placed', order: placed };
    });
  }

  findReference(orderId: string): Promise<OrderReference | null> {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: referenceOnly,
    });
  }

  countAwaitingConfirmation(phone: string): Promise<number> {
    return this.prisma.order.count({
      where: {
        contactPhone: phone,
        status: OrderStatus.AWAITING_CONFIRMATION,
      },
    });
  }

  findDetail(orderId: string): Promise<OrderRecord | null> {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: withDetail,
    });
  }

  findOwned(
    orderReference: string,
    customerId: string,
  ): Promise<OrderRecord | null> {
    return this.prisma.order.findFirst({
      where: { orderReference, customerId },
      include: withDetail,
    });
  }
}

async function nextOrderReference(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const [{ value }] = await tx.$queryRaw<{ value: bigint }[]>`
    SELECT nextval('order_reference_seq') AS value`;

  return `VP-ORD-${value.toString().padStart(6, '0')}`;
}

function toOrderData(
  { delivery, money, contact, items, ...order }: NewOrder,
  orderReference: string,
): Prisma.OrderUncheckedCreateInput {
  return {
    orderReference,
    customerId: order.customerId,
    cartId: order.cartId,
    deliveryMethod: delivery.method,
    carrier: delivery.carrier,
    deliverySnapshot: (delivery.destination ?? {}) as Prisma.InputJsonObject,
    expectedDeliveryDate: delivery.expectedDeliveryDate
      ? new Date(delivery.expectedDeliveryDate)
      : null,
    parcelWeightGrams: delivery.parcelWeightGrams,
    goodsTotal: money.goodsTotal,
    deliveryPrice: money.deliveryPrice,
    cashOnDeliveryFee: money.cashOnDeliveryFee,
    total: money.total,
    vatAmount: money.vatAmount,
    paymentMethod: order.paymentMethod,
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactPhone: contact.phone,
    contactEmail: contact.email,
    termsVersion: order.termsVersion,
    status: order.initialStatus,
    items: { create: items },
    statusHistory: {
      create: { status: order.initialStatus, source: 'shop' },
    },
  };
}
