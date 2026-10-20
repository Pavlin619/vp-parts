import { Test } from '@nestjs/testing';
import { OutboxMessage, OutboxRelay, SqsPublisher } from '../events';
import { OrderPlacedPublisher } from './order-placed.publisher';

const EVENT: OutboxMessage = {
  eventId: 'event-1',
  type: 'OrderPlaced',
  payload: { orderId: 'order-1' },
  occurredAt: new Date('2026-10-18T08:32:00Z'),
  attempts: 1,
};

describe('OrderPlacedPublisher', () => {
  let handler: OrderPlacedPublisher;

  const relay = { register: jest.fn() };
  const publisher = { publish: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderPlacedPublisher,
        { provide: OutboxRelay, useValue: relay },
        { provide: SqsPublisher, useValue: publisher },
      ],
    }).compile();

    handler = moduleRef.get(OrderPlacedPublisher);
  });

  it('takes OrderPlaced from the relay', () => {
    handler.onModuleInit();

    expect(handler.eventType).toBe('OrderPlaced');
    expect(relay.register).toHaveBeenCalledWith(handler);
  });

  it('tells the backoffice which order was placed, and nothing more', async () => {
    await handler.handle(EVENT);

    expect(publisher.publish).toHaveBeenCalledWith(EVENT, {
      orderId: 'order-1',
    });
  });

  it('fails, to be retried, on an event that names no order', async () => {
    await expect(handler.handle({ ...EVENT, payload: {} })).rejects.toThrow(
      'OrderPlaced event-1 names no order',
    );
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
