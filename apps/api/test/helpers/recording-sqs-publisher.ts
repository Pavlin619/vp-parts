import type { OutboxMessage } from '../../src/events';

/** Stands in for SQS in every e2e suite: it records, and never sends. */
export class RecordingSqsPublisher {
  readonly published: {
    event: OutboxMessage;
    fields: Record<string, string>;
  }[] = [];

  publish(event: OutboxMessage, fields: Record<string, string>): Promise<void> {
    this.published.push({ event, fields });

    return Promise.resolve();
  }
}
