import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EmailSender } from '../../email';
import { OutboxMessage, OutboxRelay } from '../../events';
import { OrdersRepository } from '../orders.repository';
import { OfficeNotificationHandler } from './office-notification.handler';
import { PLACED_ORDER_RECORD } from './placed-order.fixture';

const EVENT: OutboxMessage = {
  eventId: 'event-1',
  type: 'OrderPlaced',
  payload: { orderId: 'order-1' },
  occurredAt: new Date('2026-10-18T08:32:00Z'),
  attempts: 1,
};

describe('OfficeNotificationHandler', () => {
  let handler: OfficeNotificationHandler;

  const relay = { register: jest.fn() };
  const orders = { findDetail: jest.fn() };
  const sender = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    orders.findDetail.mockResolvedValue(PLACED_ORDER_RECORD);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OfficeNotificationHandler,
        { provide: OutboxRelay, useValue: relay },
        { provide: OrdersRepository, useValue: orders },
        { provide: EmailSender, useValue: sender },
        {
          provide: ConfigService,
          useValue: { get: () => 'orders@vp-parts.bg' },
        },
      ],
    }).compile();

    handler = moduleRef.get(OfficeNotificationHandler);
  });

  it('takes OrderPlaced from the relay', () => {
    handler.onModuleInit();

    expect(handler.eventType).toBe('OrderPlaced');
    expect(relay.register).toHaveBeenCalledWith(handler);
  });

  it('tells the office, with a reply going to the customer, once per event', async () => {
    await handler.handle(EVENT);

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'orders@vp-parts.bg',
        replyTo: 'ivan@example.com',
        subject: expect.stringContaining('Нова поръчка VP-ORD-000042'),
        text: expect.stringContaining('Тегло на пратката: 10 кг'),
      }),
      'event-1:office-notification-email',
    );
  });

  it('has no reply address for an order placed without an email', async () => {
    orders.findDetail.mockResolvedValue({
      ...PLACED_ORDER_RECORD,
      contactEmail: null,
    });

    await handler.handle(EVENT);

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'orders@vp-parts.bg', replyTo: undefined }),
      'event-1:office-notification-email',
    );
  });

  it('fails, to be retried, when the order cannot be read', async () => {
    orders.findDetail.mockResolvedValue(null);

    await expect(handler.handle(EVENT)).rejects.toThrow(
      'Order order-1 not found',
    );
    expect(sender.send).not.toHaveBeenCalled();
  });
});
