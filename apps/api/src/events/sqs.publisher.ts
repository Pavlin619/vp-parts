import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OutboxMessage } from './outbox.repository';

export const SQS_CLIENT = Symbol('SQS_CLIENT');

export class EventNotPublishedError extends Error {}

/**
 * Publishes an outbox event to `shop-events`. The queue is standard, so it
 * delivers at least once and the consumer deduplicates on `eventId` —
 * docs/ORDERS.md → "SQS".
 */
@Injectable()
export class SqsPublisher {
  private readonly queueUrl: string;

  constructor(
    @Inject(SQS_CLIENT) private readonly client: SQSClient,
    config: ConfigService,
  ) {
    this.queueUrl = config.get<string>('SQS_EVENTS_QUEUE_URL')!;
  }

  async publish(
    event: OutboxMessage,
    fields: Record<string, string>,
  ): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(bodyOf(event, fields)),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: event.type },
      },
    });

    try {
      await this.client.send(command);
    } catch (error) {
      throw new EventNotPublishedError(describeSqsError(error));
    }
  }
}

function bodyOf(event: OutboxMessage, fields: Record<string, string>) {
  return {
    ...fields,
    eventType: event.type,
    eventId: event.eventId,
    occurredAt: event.occurredAt.toISOString(),
  };
}

function describeSqsError(error: unknown): string {
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;

  if (error instanceof Error && status) {
    return `SQS answered HTTP ${status} (${error.name})`;
  }

  return `SQS unreachable: ${error instanceof Error ? error.message : String(error)}`;
}
