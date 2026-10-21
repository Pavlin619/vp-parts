import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EmailSender } from '../../email';
import { OutboxMessage, OutboxRelay } from '../../events';
import { OrderAccessKeys } from '../order-access-keys';
import { OrdersRepository } from '../orders.repository';
import { OrderConfirmationHandler } from './order-confirmation.handler';
import { PLACED_ORDER_RECORD, SHOP } from './placed-order.fixture';

const CONFIG: Record<string, string> = {
  SELLER_NAME: SHOP.seller.name,
  SELLER_COMPANY_ID: SHOP.seller.companyId,
  SELLER_ADDRESS: SHOP.seller.address,
  SELLER_EMAIL: SHOP.seller.email,
  SELLER_PHONE: SHOP.seller.phone,
  CORS_ORIGIN: SHOP.webOrigin,
  ORDER_LINK_SECRET: 's'.repeat(32),
};

const EVENT: OutboxMessage = {
  eventId: 'event-1',
  type: 'OrderPlaced',
  payload: { orderId: 'order-1' },
  occurredAt: new Date('2026-10-18T08:32:00Z'),
  attempts: 1,
};

describe('OrderConfirmationHandler', () => {
  let handler: OrderConfirmationHandler;
  let accessKeys: OrderAccessKeys;

  const relay = { register: jest.fn() };
  const orders = { findDetail: jest.fn() };
  const sender = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    orders.findDetail.mockResolvedValue(PLACED_ORDER_RECORD);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderConfirmationHandler,
        { provide: OutboxRelay, useValue: relay },
        { provide: OrdersRepository, useValue: orders },
        { provide: EmailSender, useValue: sender },
        OrderAccessKeys,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => CONFIG[key] },
        },
      ],
    }).compile();

    handler = moduleRef.get(OrderConfirmationHandler);
    accessKeys = moduleRef.get(OrderAccessKeys);
  });

  it('takes OrderPlaced from the relay', () => {
    handler.onModuleInit();

    expect(handler.eventType).toBe('OrderPlaced');
    expect(relay.register).toHaveBeenCalledWith(handler);
  });

  it('sends the confirmation to the address the order was placed with, once per event', async () => {
    await handler.handle(EVENT);

    expect(orders.findDetail).toHaveBeenCalledWith('order-1');
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ivan@example.com',
        replyTo: 'shop@vp-parts.bg',
        subject: 'Поръчка VP-ORD-000042 е приета',
        html: expect.stringContaining(
          'https://vp-parts.bg/orders/VP-ORD-000042',
        ),
        text: expect.stringContaining('ВП Партс ЕООД'),
      }),
      'event-1:order-confirmation-email',
    );
  });

  // A guest's order is emailed once the office has confirmed it by phone.
  it('links a guest’s order with its access key', async () => {
    orders.findDetail.mockResolvedValue({
      ...PLACED_ORDER_RECORD,
      customerId: null,
    });

    await handler.handle(EVENT);

    const key = accessKeys.keyFor('order-1');
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          `https://vp-parts.bg/orders/VP-ORD-000042#k=${key}`,
        ),
      }),
      'event-1:order-confirmation-email',
    );
  });

  it('sends nothing yet for an order that waits on a call, and counts as done', async () => {
    orders.findDetail.mockResolvedValue({
      ...PLACED_ORDER_RECORD,
      status: 'AWAITING_CONFIRMATION',
    });

    await expect(handler.handle(EVENT)).resolves.toBeUndefined();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('sends nothing for an order placed without an email, and counts as done', async () => {
    orders.findDetail.mockResolvedValue({
      ...PLACED_ORDER_RECORD,
      contactEmail: null,
    });

    await expect(handler.handle(EVENT)).resolves.toBeUndefined();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('fails, to be retried, when the order cannot be read', async () => {
    orders.findDetail.mockResolvedValue(null);

    await expect(handler.handle(EVENT)).rejects.toThrow(
      'Order order-1 not found',
    );
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('fails on an event that names no order', async () => {
    await expect(handler.handle({ ...EVENT, payload: {} })).rejects.toThrow(
      'OrderPlaced event-1 names no order',
    );
  });
});
