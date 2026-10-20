import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { OutboxMessage } from './outbox.repository';
import { SQS_CLIENT, SqsPublisher } from './sqs.publisher';

const QUEUE_URL =
  'https://sqs.eu-central-1.amazonaws.com/123456789012/shop-events';

const EVENT: OutboxMessage = {
  eventId: 'event-1',
  type: 'OrderPlaced',
  payload: { orderId: 'order-1' },
  occurredAt: new Date('2026-10-18T08:32:00Z'),
  attempts: 1,
};

function serviceError(name: string, httpStatusCode: number): Error {
  return Object.assign(new Error('Queue arn:aws:sqs:… refused'), {
    name,
    $metadata: { httpStatusCode },
  });
}

describe('SqsPublisher', () => {
  let publisher: SqsPublisher;

  const client = { send: jest.fn() };

  beforeEach(async () => {
    client.send.mockReset();
    client.send.mockResolvedValue({ MessageId: 'message-1' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        SqsPublisher,
        { provide: SQS_CLIENT, useValue: client },
        {
          provide: ConfigService,
          useValue: { get: () => QUEUE_URL },
        },
      ],
    }).compile();

    publisher = moduleRef.get(SqsPublisher);
  });

  it('sends the event to shop-events with the id a consumer deduplicates on', async () => {
    await publisher.publish(EVENT, { orderId: 'order-1' });

    const [command] = client.send.mock.calls[0] as [SendMessageCommand];
    expect(command).toBeInstanceOf(SendMessageCommand);
    expect(command.input.QueueUrl).toBe(QUEUE_URL);
    expect(JSON.parse(command.input.MessageBody!)).toEqual({
      eventType: 'OrderPlaced',
      eventId: 'event-1',
      orderId: 'order-1',
      occurredAt: '2026-10-18T08:32:00.000Z',
    });
  });

  it('names the event type in an attribute, so a consumer can route without parsing', async () => {
    await publisher.publish(EVENT, { orderId: 'order-1' });

    const [command] = client.send.mock.calls[0] as [SendMessageCommand];
    expect(command.input.MessageAttributes).toEqual({
      eventType: { DataType: 'String', StringValue: 'OrderPlaced' },
    });
  });

  it('keeps the envelope’s fields over a field of the same name', async () => {
    await publisher.publish(EVENT, { eventId: 'forged', orderId: 'order-1' });

    const [command] = client.send.mock.calls[0] as [SendMessageCommand];
    expect(JSON.parse(command.input.MessageBody!)).toMatchObject({
      eventId: 'event-1',
    });
  });

  it('fails with SQS’s status and error name', async () => {
    client.send.mockRejectedValue(serviceError('QueueDoesNotExist', 400));

    await expect(
      publisher.publish(EVENT, { orderId: 'order-1' }),
    ).rejects.toThrow('SQS answered HTTP 400 (QueueDoesNotExist)');
  });

  it('fails when SQS cannot be reached', async () => {
    client.send.mockRejectedValue(new Error('connect ETIMEDOUT'));

    await expect(
      publisher.publish(EVENT, { orderId: 'order-1' }),
    ).rejects.toThrow('SQS unreachable: connect ETIMEDOUT');
  });
});
