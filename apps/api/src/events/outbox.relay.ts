import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { OutboxHandler } from './outbox-handler';
import {
  ClaimedEvent,
  Lease,
  OutboxMessage,
  OutboxRepository,
} from './outbox.repository';

/** The interval's name in the `SchedulerRegistry`. */
export const OUTBOX_RELAY_INTERVAL = 'outbox-relay';

const RELAY_EVERY_MS = 5_000;
const BATCH_SIZE = 10;
const LEASE_MS = 5 * 60_000;

// A send that timed out may still have gone out. Ten attempts span about three
// hours, well inside the 24 hours Resend keeps the idempotency key that dedupes it.
const MAX_ATTEMPTS = 10;
const FIRST_RETRY_MS = 30_000;
const LONGEST_RETRY_MS = 60 * 60_000;

/**
 * Sends committed outbox events to their handlers — docs/ORDERS.md → "After the
 * commit: the outbox". Each instance claims its own batch, so several can run.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly handlersByType = new Map<string, OutboxHandler[]>();
  private isRelaying = false;

  constructor(private readonly outbox: OutboxRepository) {}

  register(handler: OutboxHandler): void {
    const handlers = this.handlersByType.get(handler.eventType) ?? [];

    this.handlersByType.set(handler.eventType, [...handlers, handler]);
  }

  @Interval(OUTBOX_RELAY_INTERVAL, RELAY_EVERY_MS)
  async relayDue(): Promise<void> {
    if (this.isRelaying) {
      return;
    }

    this.isRelaying = true;

    try {
      const events = await this.outbox.claimDue({
        now: new Date(),
        limit: BATCH_SIZE,
        leaseMs: LEASE_MS,
        maxAttempts: MAX_ATTEMPTS,
      });

      for (const event of events) {
        await this.deliver(event);
      }
    } finally {
      this.isRelaying = false;
    }
  }

  private async deliver(claimed: ClaimedEvent): Promise<void> {
    try {
      const failures = await this.runPendingHandlers(claimed);

      await this.settle(claimed, failures);
    } catch (error) {
      if (!(error instanceof LeaseLostError)) {
        throw error;
      }

      this.logger.warn(
        `${labelOf(claimed.message)}: its lease ran out mid-delivery; ` +
          'the claim that took it over finishes it',
      );
    }
  }

  /**
   * Runs each handler an earlier attempt left undone, even when one fails, so
   * one bad send holds up no other and a retry never repeats a finished one.
   */
  private async runPendingHandlers(claimed: ClaimedEvent): Promise<string[]> {
    const { message, completedHandlers } = claimed;
    const handlers = this.handlersByType.get(message.type) ?? [];

    if (handlers.length === 0) {
      return [`no handler for ${message.type}`];
    }

    const lease = leaseOf(claimed);
    const pending = handlers.filter(
      (handler) => !completedHandlers.includes(handler.name),
    );
    const failures: string[] = [];

    for (const handler of pending) {
      try {
        await handler.handle(message);
        await requireLease(this.outbox.recordHandlerDone(lease, handler.name));
      } catch (error) {
        if (error instanceof LeaseLostError) {
          throw error;
        }

        failures.push(`${handler.name}: ${describeError(error)}`);
      }
    }

    return failures;
  }

  private async settle(
    claimed: ClaimedEvent,
    failures: string[],
  ): Promise<void> {
    const lease = leaseOf(claimed);

    if (failures.length === 0) {
      await requireLease(this.outbox.deleteDelivered(lease));
      return;
    }

    await this.retryLater(claimed.message, lease, failures.join('; '));
  }

  private async retryLater(
    event: OutboxMessage,
    lease: Lease,
    error: string,
  ): Promise<void> {
    await requireLease(
      this.outbox.scheduleRetry(lease, {
        availableAt: new Date(Date.now() + retryDelayMs(event.attempts)),
        error,
      }),
    );

    const label = labelOf(event);

    if (event.attempts >= MAX_ATTEMPTS) {
      this.logger.error(
        `${label} gave up after ${event.attempts} attempts: ${error}`,
      );
    } else {
      this.logger.warn(`${label} failed attempt ${event.attempts}: ${error}`);
    }
  }
}

class LeaseLostError extends Error {}

async function requireLease(write: Promise<boolean>): Promise<void> {
  if (!(await write)) {
    throw new LeaseLostError();
  }
}

function leaseOf({ message, claimToken }: ClaimedEvent): Lease {
  return { eventId: message.eventId, claimToken };
}

function labelOf(event: OutboxMessage): string {
  return `Outbox event ${event.eventId} (${event.type})`;
}

export function retryDelayMs(attempts: number): number {
  return Math.min(FIRST_RETRY_MS * 2 ** (attempts - 1), LONGEST_RETRY_MS);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
