import type { OutboxMessage } from './outbox.repository';

/**
 * Does one thing with an event. Delivery is at least once — a failure in any
 * handler retries the event for all of them — so every handler is idempotent
 * on the event's id.
 */
export interface OutboxHandler {
  readonly name: string;
  readonly eventType: string;
  handle(event: OutboxMessage): Promise<void>;
}

/** The key a handler hands an external service to make its retry a no-op. */
export function idempotencyKeyOf(
  event: OutboxMessage,
  handler: OutboxHandler,
): string {
  return `${event.eventId}:${handler.name}`;
}
