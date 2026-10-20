import type { OutboxMessage } from '../events';
import type { OrderRecord, OrdersRepository } from './orders.repository';

/**
 * A thin event: it names the order and nothing else, so no customer data sits
 * in the outbox, a queue or a DLQ — docs/ORDERS.md → "`OrderPlaced`".
 */
export const ORDER_PLACED = 'OrderPlaced';

export interface OrderPlacedPayload {
  orderId: string;
}

export function orderIdOf(event: OutboxMessage): string {
  const { orderId } = (event.payload ?? {}) as Partial<OrderPlacedPayload>;

  if (typeof orderId !== 'string') {
    throw new Error(`${event.type} ${event.eventId} names no order`);
  }

  return orderId;
}

export async function readPlacedOrder(
  orders: OrdersRepository,
  event: OutboxMessage,
): Promise<OrderRecord> {
  const orderId = orderIdOf(event);
  const order = await orders.findDetail(orderId);

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  return order;
}
