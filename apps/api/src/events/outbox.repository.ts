import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService, utcTimestamp } from '../prisma';

export interface NewOutboxEvent {
  type: string;
  payload: Prisma.InputJsonObject;
}

/** An event as its handlers receive it. */
export interface OutboxMessage {
  eventId: string;
  type: string;
  payload: Prisma.JsonValue;
  occurredAt: Date;
  /** Counting the attempt being made now. */
  attempts: number;
}

/** An event leased to the relay, with the handlers an earlier attempt finished. */
export interface ClaimedEvent {
  message: OutboxMessage;
  claimToken: string;
  completedHandlers: string[];
}

/** One claim on one event. A write under a lease a later claim replaced changes nothing. */
export interface Lease {
  eventId: string;
  claimToken: string;
}

export interface ClaimOptions {
  now: Date;
  limit: number;
  leaseMs: number;
  maxAttempts: number;
}

interface ClaimedRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
  attempts: number;
  claimToken: string;
  completedHandlers: string[];
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the event in the caller's transaction, so it commits with the change it reports. */
  async append(
    tx: Prisma.TransactionClient,
    event: NewOutboxEvent,
  ): Promise<void> {
    await tx.outboxEvent.create({ data: event });
  }

  /**
   * Leases due events to this caller until `now + leaseMs`, counting the
   * attempt. One statement, so its row locks end with it and no lock is held
   * while the handlers call out; a crashed relay's lease simply runs out.
   */
  async claimDue({
    now,
    limit,
    leaseMs,
    maxAttempts,
  }: ClaimOptions): Promise<ClaimedEvent[]> {
    const leasedUntil = new Date(now.getTime() + leaseMs);

    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "OutboxEvent"
      SET "availableAt" = ${utcTimestamp(leasedUntil)},
        attempts = attempts + 1,
        "claimToken" = gen_random_uuid()
      WHERE id IN (
        SELECT id FROM "OutboxEvent"
        WHERE "availableAt" <= ${utcTimestamp(now)}
          AND attempts < ${maxAttempts}
        ORDER BY "availableAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, "createdAt", attempts, "claimToken",
        "completedHandlers"`;

    return rows.map(toClaimedEvent);
  }

  /** Each write answers whether the lease still held, and changes nothing if not. */
  async recordHandlerDone(lease: Lease, handlerName: string): Promise<boolean> {
    const { count } = await this.prisma.outboxEvent.updateMany({
      where: heldBy(lease),
      data: { completedHandlers: { push: handlerName } },
    });

    return count > 0;
  }

  async deleteDelivered(lease: Lease): Promise<boolean> {
    const { count } = await this.prisma.outboxEvent.deleteMany({
      where: heldBy(lease),
    });

    return count > 0;
  }

  async scheduleRetry(
    lease: Lease,
    retry: { availableAt: Date; error: string },
  ): Promise<boolean> {
    const { count } = await this.prisma.outboxEvent.updateMany({
      where: heldBy(lease),
      data: { availableAt: retry.availableAt, lastError: retry.error },
    });

    return count > 0;
  }
}

function heldBy({ eventId, claimToken }: Lease) {
  return { id: eventId, claimToken };
}

function toClaimedEvent(row: ClaimedRow): ClaimedEvent {
  return {
    message: {
      eventId: row.id,
      type: row.type,
      payload: row.payload,
      occurredAt: row.createdAt,
      attempts: row.attempts,
    },
    claimToken: row.claimToken,
    completedHandlers: row.completedHandlers,
  };
}
