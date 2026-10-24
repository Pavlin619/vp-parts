import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import request from 'supertest';
import type Redis from 'ioredis';
import {
  AppErrorCode,
  CartDto,
  DeliveryMethod,
  OrderDetailDto,
  PaymentMethod,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { DominaiteFake } from './helpers/dominaite-fake';
import { RecordingEmailSender } from './helpers/recording-email-sender';
import { RecordingSqsPublisher } from './helpers/recording-sqs-publisher';
import { ClerkUsers } from '../src/auth';
import { ClerkJwtStrategy } from '../src/auth/clerk-jwt.strategy';
import { ArticlesTecDoc } from '../src/catalog';
import { EcontTransport } from '../src/delivery/econt/econt.transport';
import { EmailSender } from '../src/email';
import {
  OUTBOX_RELAY_INTERVAL,
  OutboxRelay,
  SqsPublisher,
} from '../src/events';
import { InventoryService } from '../src/inventory';
import { MAX_PAYMENT_ATTEMPTS } from '../src/orders/card-payment/card-payment.policy';
import {
  CARD_PAYMENT_SWEEP_INTERVAL,
  CardPaymentSweep,
} from '../src/orders/card-payment/card-payment.sweep';
import { DOMINAITE_CLIENT } from '../src/payments/dominaite.client';
import { PrismaService } from '../src/prisma';
import { REDIS_CLIENT } from '../src/redis';

const RUN = `e2e-card-orders-${Date.now()}`;

const clerkJwtStrategy = {
  verifyToken: (token: string) =>
    token.startsWith('test:')
      ? Promise.resolve({ sub: token.slice('test:'.length) })
      : Promise.reject(new Error('invalid token')),
};

const clerkUsers = {
  findIdentity: (clerkId: string) =>
    Promise.resolve({
      email: `${clerkId}@example.com`,
      firstName: 'Иван',
      lastName: 'Петров',
      unsafeMetadata: { phoneNumber: '0888 123 456' },
    }),
};

const articles = {
  getArticleDetails: () =>
    Promise.resolve({
      detail: {},
      genericArticleIds: [],
      shippingProfile: { weightGrams: 2000, packageCm: null },
    }),
};

const inventory = {
  getAvailability: (identities: { brandId: string; articleNumber: string }[]) =>
    Promise.resolve(
      new Map(
        identities.map(({ brandId, articleNumber }) => [
          `${brandId}:${articleNumber}`,
          {
            available: true,
            bestPriceExVat: null,
            bestPriceIncVat: PRICES[articleNumber],
            availabilityByWarehouse: [
              {
                warehouseId: 'REGIONAL_2',
                quantity: 10,
                deliveryWorkDays: 1,
                orderCutoffTime: '17:00',
                cutoffAt: '2026-10-19T14:00:00Z',
                pickup: {
                  earliestAt: '2026-10-20T06:00:00Z',
                  granularity: 'DAY',
                },
                courier: {
                  earliestAt: '2026-10-20T06:00:00Z',
                  granularity: 'DAY',
                },
              },
            ],
            computedAt: '2026-10-19T06:00:00Z',
          },
        ]),
      ),
    ),
};

const PRICES: Record<string, number> = { DISC: 1299, PAD: 749 };

const SOFIA_ID = 41;

const NOMENCLATURES: Record<string, object> = {
  'Nomenclatures/NomenclaturesService.getOffices': {
    offices: [
      {
        code: '1127',
        name: 'София Център',
        isAPS: false,
        isMPS: false,
        isDrive: false,
        address: {
          city: { id: SOFIA_ID, name: 'София', postCode: '1000' },
          fullAddress: 'София ул. Граф Игнатиев 1',
          location: { latitude: 42.69, longitude: 23.32 },
        },
        normalBusinessHoursFrom: null,
        normalBusinessHoursTo: null,
        halfDayBusinessHoursFrom: null,
        halfDayBusinessHoursTo: null,
      },
    ],
  },
  'Nomenclatures/NomenclaturesService.getCities': {
    cities: [
      {
        id: SOFIA_ID,
        name: 'София',
        regionName: 'София',
        postCode: '1000',
        servingOffices: [
          { officeCode: '1127', servingType: 'to_office_courier' },
        ],
      },
    ],
  },
};

/** Econt prices a parcel that collects no cash with no fee in it. */
const econt = {
  readNomenclature: (service: string) =>
    Promise.resolve(NOMENCLATURES[service]),
  call: () =>
    Promise.resolve({
      label: {
        totalPrice: 3.78,
        currency: 'EUR',
        expectedDeliveryDate: new Date('2026-10-22T15:00:00Z').getTime(),
        services: [{ type: 'C', price: 3.78, currency: 'EUR' }],
      },
    }),
};

const TO_OFFICE = {
  method: DeliveryMethod.COURIER_OFFICE,
  carrier: ShippingMethod.ECONT,
  officeCode: '1127',
};

const GOODS = 2 * 1299 + 3 * 749;
const CARD_TOTAL = GOODS + 378;

describe('Card orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dominaite: DominaiteFake;
  let customerCount = 0;

  const server = () => app.getHttpServer();
  const auth = (clerkId: string) => `Bearer test:${clerkId}`;

  beforeAll(async () => {
    dominaite = new DominaiteFake();
    app = await createTestApp((builder) => {
      builder.overrideProvider(ClerkJwtStrategy).useValue(clerkJwtStrategy);
      builder.overrideProvider(ClerkUsers).useValue(clerkUsers);
      builder.overrideProvider(ArticlesTecDoc).useValue(articles);
      builder.overrideProvider(InventoryService).useValue(inventory);
      builder.overrideProvider(EcontTransport).useValue(econt);
      builder.overrideProvider(DOMINAITE_CLIENT).useValue(dominaite);
    });
    prisma = app.get(PrismaService);
    // The suite relays and sweeps by hand, so a tick never races an assertion.
    app.get(SchedulerRegistry).deleteInterval(OUTBOX_RELAY_INTERVAL);
    app.get(SchedulerRegistry).deleteInterval(CARD_PAYMENT_SWEEP_INTERVAL);
  });

  afterAll(async () => {
    const customer = { clerkId: { startsWith: RUN } };
    const orders = await prisma.order.findMany({
      where: { customer },
      select: { id: true },
    });

    await prisma.outboxEvent.deleteMany({
      where: {
        OR: orders.map(({ id }) => ({
          payload: { path: ['orderId'], equals: id },
        })),
      },
    });
    await prisma.paymentWebhookEvent.deleteMany({
      where: { id: { startsWith: RUN } },
    });
    await prisma.cardPayment.deleteMany({ where: { order: { customer } } });
    // Cart and order name each other with RESTRICT keys, so one side lets go first.
    await prisma.cart.updateMany({
      where: { customer },
      data: { orderId: null },
    });
    await prisma.orderItem.deleteMany({ where: { order: { customer } } });
    await prisma.orderStatusHistory.deleteMany({
      where: { order: { customer } },
    });
    await prisma.order.deleteMany({ where: { customer } });
    await prisma.cart.deleteMany({ where: { customer } });
    await prisma.customer.deleteMany({ where: customer });
    await app.close();
  });

  beforeEach(async () => {
    resetRateLimits(app);
    await app.get<Redis>(REDIS_CLIENT).flushall();
  });

  async function signUp() {
    const clerkId = `${RUN}-${++customerCount}`;

    await request(server())
      .post('/customers/me')
      .set('Authorization', auth(clerkId))
      .expect(201);

    return clerkId;
  }

  async function addLine(
    clerkId: string,
    articleNumber: string,
    quantity: number,
  ) {
    const response = await request(server())
      .post('/cart/items')
      .set('Authorization', auth(clerkId))
      .send({
        brandId: '30',
        articleNumber,
        quantity,
        brandName: 'BOSCH',
        brandLogoUrl: null,
        description: `Част ${articleNumber}`,
        thumbnailUrl: null,
        addedAtPriceIncVat: null,
      })
      .expect(201);

    return response.body as CartDto;
  }

  function placeOrder(
    clerkId: string,
    cart: CartDto,
    overrides: Record<string, unknown> = {},
  ) {
    return request(server())
      .post('/orders')
      .set('Authorization', auth(clerkId))
      .send({
        cartId: cart.id,
        cartVersion: cart.version,
        expectedTotalCents: CARD_TOTAL,
        paymentMethod: PaymentMethod.CARD,
        delivery: TO_OFFICE,
        ...overrides,
      });
  }

  /** A customer who has placed a card order for two discs and three pads. */
  async function cardOrder() {
    const clerkId = await signUp();
    await addLine(clerkId, 'DISC', 2);
    const cart = await addLine(clerkId, 'PAD', 3);
    const { body } = await placeOrder(clerkId, cart).expect(201);

    return {
      clerkId,
      cart,
      orderId: body.orderId as string,
      orderReference: body.orderReference as string,
    };
  }

  function openPayment(clerkId: string, orderReference: string) {
    return request(server())
      .post(`/orders/${orderReference}/payment`)
      .set('Authorization', auth(clerkId));
  }

  const attemptsOf = (orderId: string) =>
    prisma.cardPayment.findMany({
      where: { orderId },
      orderBy: { attempt: 'asc' },
    });

  /** A card order whose payment session is open, as the widget would find it. */
  async function cardOrderToPay() {
    const order = await cardOrder();
    await openPayment(order.clerkId, order.orderReference).expect(200);
    const [attempt] = await attemptsOf(order.orderId);

    return { ...order, transactionId: attempt.transactionId };
  }

  function signed(body: string, timestamp = Math.floor(Date.now() / 1000)) {
    const secret = app
      .get(ConfigService)
      .getOrThrow<string>('DOMINAITE_WEBHOOK_SECRET');
    const mac = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    return `t=${timestamp},v1=${mac}`;
  }

  function deliver(body: string, signature = signed(body)) {
    return request(server())
      .post('/payments/dominaite/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', signature)
      .send(body);
  }

  function paymentDelivery(
    type: string,
    transactionId: string,
    data: Record<string, unknown> = {},
    deliveryId = `${RUN}-${randomUUID()}`,
  ) {
    return JSON.stringify({
      id: deliveryId,
      type,
      createdAt: new Date().toISOString(),
      data: {
        transactionId,
        status: type.replace('payment.', ''),
        amount: CARD_TOTAL,
        currency: 'EUR',
        ...data,
      },
    });
  }

  const orderPlacedOf = (orderId: string) =>
    prisma.outboxEvent.findMany({
      where: {
        type: 'OrderPlaced',
        payload: { path: ['orderId'], equals: orderId },
      },
    });

  /** Relays until the order's event is delivered; other suites may have left events due. */
  async function relayOrderPlaced(orderId: string) {
    const [event] = await orderPlacedOf(orderId);
    expect(event).toBeDefined();

    for (let tick = 0; tick < 20; tick++) {
      await app.get(OutboxRelay).relayDue();

      if ((await orderPlacedOf(orderId)).length === 0) {
        return event;
      }
    }

    throw new Error(`OrderPlaced for ${orderId} was never delivered`);
  }

  const refundDueOf = (orderId: string) =>
    prisma.outboxEvent.findMany({
      where: {
        type: 'CardPaymentRefundDue',
        payload: { path: ['orderId'], equals: orderId },
      },
    });

  async function relayRefundDue(orderId: string) {
    expect(await refundDueOf(orderId)).toHaveLength(1);

    for (let tick = 0; tick < 20; tick++) {
      await app.get(OutboxRelay).relayDue();

      if ((await refundDueOf(orderId)).length === 0) {
        return;
      }
    }

    throw new Error(`The refund of ${orderId} was never relayed`);
  }

  const orderOf = (orderId: string) =>
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { statusHistory: { orderBy: { occurredAt: 'asc' } } },
    });

  /**
   * Sweeps until the order leaves `PENDING_PAYMENT`. A run reads a batch of
   * the open sessions, and other tests leave theirs open.
   */
  async function sweepUntilSettled(orderId: string) {
    for (let run = 0; run < 20; run++) {
      await app.get(CardPaymentSweep).sweep();
      const order = await orderOf(orderId);

      if (order.status !== 'PENDING_PAYMENT') {
        return order;
      }
    }

    throw new Error(`The sweep never settled order ${orderId}`);
  }

  describe('placing a card order', () => {
    it('writes the order to wait for its payment, with no cash-on-delivery fee', async () => {
      const { orderId, cart } = await cardOrder();

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { statusHistory: true },
      });
      expect(order).toMatchObject({
        cartId: cart.id,
        paymentMethod: 'CARD',
        status: 'PENDING_PAYMENT',
        goodsTotal: GOODS,
        deliveryPrice: 378,
        cashOnDeliveryFee: 0,
        total: CARD_TOTAL,
      });
      expect(order.statusHistory).toEqual([
        expect.objectContaining({ status: 'PENDING_PAYMENT', source: 'shop' }),
      ]);
    });

    it('announces nothing until it is paid: no email, no message to the backoffice', async () => {
      const { orderId } = await cardOrder();

      await expect(
        prisma.outboxEvent.count({
          where: { payload: { path: ['orderId'], equals: orderId } },
        }),
      ).resolves.toBe(0);
    });

    it('closes the cart as any order does, so a retry finds the same order', async () => {
      const { clerkId, cart, orderId } = await cardOrder();

      const retry = await placeOrder(clerkId, cart).expect(200);

      expect(retry.body.orderId).toBe(orderId);
      await expect(
        prisma.cart.findUniqueOrThrow({ where: { id: cart.id } }),
      ).resolves.toMatchObject({ status: 'ORDERED', orderId });
    });

    it('reads back as waiting for its payment', async () => {
      const { clerkId, orderReference } = await cardOrder();

      const response = await request(server())
        .get(`/orders/${orderReference}`)
        .set('Authorization', auth(clerkId))
        .expect(200);

      expect(response.body as OrderDetailDto).toMatchObject({
        status: 'PENDING_PAYMENT',
        paymentMethod: PaymentMethod.CARD,
        cashOnDeliveryFee: 0,
        total: CARD_TOTAL,
      });
    });
  });

  describe('opening its payment', () => {
    it('opens a session for the order’s stored total, answering what the widget needs', async () => {
      const { clerkId, orderId, orderReference } = await cardOrder();

      const response = await openPayment(clerkId, orderReference).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        cashierKey: expect.stringMatching(/^ck_/),
        cashierToken: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect(dominaite.opened.at(-1)).toMatchObject({
        amount: CARD_TOTAL,
        currency: 'EUR',
        orderReference,
        language: 'bg',
        idempotencyKey: `checkout-1-${orderReference}-${CARD_TOTAL}-EUR`,
        customer: {
          firstName: 'Иван',
          lastName: 'Петров',
          phone: '+359888123456',
        },
      });
      await expect(attemptsOf(orderId)).resolves.toEqual([
        expect.objectContaining({
          attempt: 1,
          status: 'OPEN',
          amount: CARD_TOTAL,
          currency: 'EUR',
        }),
      ]);
    });

    it('answers the same open session on a reload, recording it once', async () => {
      const { clerkId, orderId, orderReference } = await cardOrder();

      const first = await openPayment(clerkId, orderReference).expect(200);
      const reload = await openPayment(clerkId, orderReference).expect(200);

      expect(reload.body).toEqual(first.body);
      await expect(attemptsOf(orderId)).resolves.toHaveLength(1);
    });

    it('opens the next attempt once the open one’s payment has failed', async () => {
      const { clerkId, orderId, orderReference } = await cardOrder();
      const first = await openPayment(clerkId, orderReference).expect(200);
      const [opened] = await attemptsOf(orderId);
      dominaite.settle(opened.transactionId, 'failed');

      const retry = await openPayment(clerkId, orderReference).expect(200);

      expect(retry.body.cashierToken).not.toBe(first.body.cashierToken);
      expect(dominaite.opened.at(-1)?.idempotencyKey).toBe(
        `checkout-2-${orderReference}-${CARD_TOTAL}-EUR`,
      );
      await expect(attemptsOf(orderId)).resolves.toEqual([
        expect.objectContaining({ attempt: 1, status: 'FAILED' }),
        expect.objectContaining({ attempt: 2, status: 'OPEN' }),
      ]);
    });

    it('says the payment is being confirmed, opening no other, when Dominaite says the order is paid', async () => {
      const { clerkId, orderId, orderReference } = await cardOrder();
      await openPayment(clerkId, orderReference).expect(200);
      const [opened] = await attemptsOf(orderId);
      dominaite.settle(opened.transactionId, 'paid');

      const response = await openPayment(clerkId, orderReference).expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        errorCode: AppErrorCode.ORDER_PAYMENT_PROCESSING,
      });
      await expect(attemptsOf(orderId)).resolves.toHaveLength(1);
    });

    it(`takes no more than ${MAX_PAYMENT_ATTEMPTS} attempts, each declined`, async () => {
      const { clerkId, orderId, orderReference } = await cardOrder();

      for (let attempt = 1; attempt <= MAX_PAYMENT_ATTEMPTS; attempt++) {
        await openPayment(clerkId, orderReference).expect(200);
        const opened = await attemptsOf(orderId);
        dominaite.settle(opened.at(-1)!.transactionId, 'failed');
      }

      const response = await openPayment(clerkId, orderReference).expect(409);

      expect(response.body.errorCode).toBe(AppErrorCode.ORDER_NOT_PAYABLE);
      const attempts = await attemptsOf(orderId);
      expect(attempts).toHaveLength(MAX_PAYMENT_ATTEMPTS);
      expect(attempts.every(({ status }) => status === 'FAILED')).toBe(true);
    });

    it('refuses an order paid on delivery', async () => {
      const clerkId = await signUp();
      const cart = await addLine(clerkId, 'DISC', 1);
      const { body } = await placeOrder(clerkId, cart, {
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        delivery: { method: DeliveryMethod.STORE_PICKUP },
        expectedTotalCents: 1299,
      }).expect(201);

      const response = await openPayment(clerkId, body.orderReference).expect(
        409,
      );

      expect(response.body.errorCode).toBe(AppErrorCode.ORDER_NOT_PAYABLE);
    });

    it('answers anyone else as though there were no such order', async () => {
      const { orderReference } = await cardOrder();
      const stranger = await signUp();

      const response = await openPayment(stranger, orderReference).expect(404);

      expect(response.body.errorCode).toBe(AppErrorCode.ORDER_NOT_FOUND);
    });

    it('refuses a visitor who is not signed in', async () => {
      const { orderReference } = await cardOrder();

      await request(server())
        .post(`/orders/${orderReference}/payment`)
        .expect(401);
    });
  });

  describe('confirming its payment: the webhook', () => {
    it('marks the order paid on payment.succeeded, and only then announces it', async () => {
      const { orderId, transactionId } = await cardOrderToPay();

      await deliver(paymentDelivery('payment.succeeded', transactionId)).expect(
        200,
      );

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { statusHistory: { orderBy: { occurredAt: 'asc' } } },
      });
      expect(order).toMatchObject({
        status: 'PROCESSING',
        paymentReference: transactionId,
      });
      expect(order.statusHistory).toEqual([
        expect.objectContaining({ status: 'PENDING_PAYMENT', source: 'shop' }),
        expect.objectContaining({ status: 'PROCESSING', source: 'dominaite' }),
      ]);
      await expect(attemptsOf(orderId)).resolves.toEqual([
        expect.objectContaining({ attempt: 1, status: 'SUCCEEDED' }),
      ]);
      await expect(orderPlacedOf(orderId)).resolves.toHaveLength(1);
    });

    it('tells the customer it is paid, the office to collect nothing, and the backoffice', async () => {
      const { orderId, transactionId } = await cardOrderToPay();
      await deliver(paymentDelivery('payment.succeeded', transactionId)).expect(
        200,
      );

      const event = await relayOrderPlaced(orderId);

      const emails = app
        .get<RecordingEmailSender>(EmailSender)
        .sent.filter(({ idempotencyKey }) =>
          idempotencyKey.startsWith(event.id),
        );
      const textOf = (handler: string) =>
        emails.find(({ idempotencyKey }) => idempotencyKey.endsWith(handler))
          ?.email.text;
      expect(textOf('order-confirmation-email')).toContain('Платено с карта');
      expect(textOf('order-confirmation-email')).not.toContain('Платете');
      expect(textOf('office-notification-email')).toContain(
        'Платено с карта — без наложен платеж',
      );
      expect(textOf('office-notification-email')).not.toContain(
        'Наложен платеж за събиране',
      );
      expect(
        app
          .get<RecordingSqsPublisher>(SqsPublisher)
          .published.filter(
            (published) => published.event.eventId === event.id,
          ),
      ).toEqual([
        {
          event: expect.objectContaining({ type: 'OrderPlaced' }),
          fields: { orderId },
        },
      ]);
    });

    it('announces the order once, however often the success is delivered', async () => {
      const { orderId, transactionId } = await cardOrderToPay();
      const delivery = paymentDelivery('payment.succeeded', transactionId);

      await deliver(delivery).expect(200);
      await deliver(delivery).expect(200);
      await deliver(paymentDelivery('payment.succeeded', transactionId)).expect(
        200,
      );

      await expect(orderPlacedOf(orderId)).resolves.toHaveLength(1);
      await expect(
        prisma.orderStatusHistory.count({ where: { orderId } }),
      ).resolves.toBe(2);
    });

    it('leaves the order unpaid when the amount taken is not its total', async () => {
      const { orderId, transactionId } = await cardOrderToPay();

      await deliver(
        paymentDelivery('payment.succeeded', transactionId, {
          amount: CARD_TOTAL - 1,
        }),
      ).expect(200);

      await expect(
        prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      ).resolves.toMatchObject({
        status: 'PENDING_PAYMENT',
        paymentReference: null,
      });
      await expect(orderPlacedOf(orderId)).resolves.toHaveLength(0);
    });

    it('closes the attempt on payment.failed, so another card opens the next one', async () => {
      const { clerkId, orderId, orderReference, transactionId } =
        await cardOrderToPay();

      await deliver(paymentDelivery('payment.failed', transactionId)).expect(
        200,
      );

      await expect(
        prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      ).resolves.toMatchObject({ status: 'PENDING_PAYMENT' });
      await openPayment(clerkId, orderReference).expect(200);
      expect(dominaite.opened.at(-1)?.idempotencyKey).toBe(
        `checkout-2-${orderReference}-${CARD_TOTAL}-EUR`,
      );
      await expect(attemptsOf(orderId)).resolves.toEqual([
        expect.objectContaining({ attempt: 1, status: 'FAILED' }),
        expect.objectContaining({ attempt: 2, status: 'OPEN' }),
      ]);
    });

    it('cancels the order on payment.abandoned', async () => {
      const { orderId, transactionId } = await cardOrderToPay();

      await deliver(paymentDelivery('payment.abandoned', transactionId)).expect(
        200,
      );

      const order = await orderOf(orderId);
      expect(order.status).toBe('CANCELLED');
      expect(order.statusHistory.at(-1)).toMatchObject({
        status: 'CANCELLED',
        source: 'dominaite',
      });
      await expect(attemptsOf(orderId)).resolves.toEqual([
        expect.objectContaining({ status: 'ABANDONED' }),
      ]);
      await expect(orderPlacedOf(orderId)).resolves.toHaveLength(0);
    });

    it('cancels the order once, however often the abandonment is delivered', async () => {
      const { orderId, transactionId } = await cardOrderToPay();
      const delivery = paymentDelivery('payment.abandoned', transactionId);

      await deliver(delivery).expect(200);
      await deliver(delivery).expect(200);
      await deliver(paymentDelivery('payment.abandoned', transactionId)).expect(
        200,
      );

      const { statusHistory } = await orderOf(orderId);
      expect(
        statusHistory.filter(({ status }) => status === 'CANCELLED'),
      ).toHaveLength(1);
    });

    it('cancels the order when the last card allowed is declined', async () => {
      const { clerkId, orderId, orderReference } = await cardOrder();

      for (let attempt = 1; attempt <= MAX_PAYMENT_ATTEMPTS; attempt++) {
        await openPayment(clerkId, orderReference).expect(200);
        const opened = (await attemptsOf(orderId)).at(-1)!;
        dominaite.settle(opened.transactionId, 'failed');
        await deliver(
          paymentDelivery('payment.failed', opened.transactionId),
        ).expect(200);
      }

      await expect(orderOf(orderId)).resolves.toMatchObject({
        status: 'CANCELLED',
      });
    });

    it('gives a payment back when it arrives after its order was cancelled', async () => {
      const { orderId, transactionId } = await cardOrderToPay();
      await deliver(paymentDelivery('payment.abandoned', transactionId)).expect(
        200,
      );

      await deliver(paymentDelivery('payment.succeeded', transactionId)).expect(
        200,
      );

      await expect(orderOf(orderId)).resolves.toMatchObject({
        status: 'CANCELLED',
        paymentReference: null,
      });
      await expect(orderPlacedOf(orderId)).resolves.toHaveLength(0);
      await relayRefundDue(orderId);
      expect(
        dominaite.refunds.filter(
          (refund) => refund.transactionId === transactionId,
        ),
      ).toEqual([
        {
          transactionId,
          params: expect.objectContaining({
            idempotencyKey: `late-${transactionId}`,
          }),
        },
      ]);
    });

    it('answers an event it does not act on, so Dominaite stops delivering it', async () => {
      const { orderId, transactionId } = await cardOrderToPay();

      await deliver(paymentDelivery('payment.refunded', transactionId)).expect(
        200,
      );
      await deliver(paymentDelivery('payment.succeeded', randomUUID())).expect(
        200,
      );

      await expect(attemptsOf(orderId)).resolves.toEqual([
        expect.objectContaining({ status: 'OPEN' }),
      ]);
    });

    it('refuses a delivery whose signature does not match, changing nothing', async () => {
      const { orderId, transactionId } = await cardOrderToPay();
      const delivery = paymentDelivery('payment.succeeded', transactionId);

      const response = await deliver(
        delivery,
        signed(delivery.replace(String(CARD_TOTAL), '1')),
      ).expect(400);

      expect(response.body).toEqual({
        statusCode: 400,
        errorCode: expect.any(String),
      });
      await expect(
        prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      ).resolves.toMatchObject({ status: 'PENDING_PAYMENT' });
    });

    it('refuses a delivery signed too long ago, so a captured one cannot be replayed', async () => {
      const { orderId, transactionId } = await cardOrderToPay();
      const delivery = paymentDelivery('payment.succeeded', transactionId);
      const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;

      await deliver(delivery, signed(delivery, tenMinutesAgo)).expect(400);

      await expect(
        prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      ).resolves.toMatchObject({ status: 'PENDING_PAYMENT' });
    });

    it('refuses a delivery with no signature', async () => {
      const { transactionId } = await cardOrderToPay();

      await request(server())
        .post('/payments/dominaite/webhook')
        .set('Content-Type', 'application/json')
        .send(paymentDelivery('payment.succeeded', transactionId))
        .expect(400);
    });
  });

  describe('the sweep', () => {
    it('marks the order paid from Dominaite’s status when the webhook never came', async () => {
      const { orderId, transactionId } = await cardOrderToPay();
      dominaite.settle(transactionId, 'paid');

      const order = await sweepUntilSettled(orderId);

      expect(order).toMatchObject({
        status: 'PROCESSING',
        paymentReference: transactionId,
      });
      await expect(attemptsOf(orderId)).resolves.toEqual([
        expect.objectContaining({ status: 'SUCCEEDED' }),
      ]);
      await expect(orderPlacedOf(orderId)).resolves.toHaveLength(1);
    });

    it('cancels the order when Dominaite says its session was abandoned', async () => {
      const { orderId, transactionId } = await cardOrderToPay();
      dominaite.settle(transactionId, 'abandoned');

      const order = await sweepUntilSettled(orderId);

      expect(order.status).toBe('CANCELLED');
      expect(order.statusHistory.at(-1)?.source).toBe('dominaite');
    });

    it('gives the order up once its session is past expiry and the grace after it', async () => {
      const { orderId } = await cardOrderToPay();
      await prisma.cardPayment.updateMany({
        where: { orderId },
        data: { expiresAt: new Date(Date.now() - 20 * 60_000) },
      });

      const order = await sweepUntilSettled(orderId);

      expect(order.status).toBe('CANCELLED');
      expect(order.statusHistory.at(-1)?.source).toBe('shop');
      await expect(attemptsOf(orderId)).resolves.toEqual([
        expect.objectContaining({ status: 'ABANDONED' }),
      ]);
    });

    it('leaves an open session inside its time alone', async () => {
      const { orderId } = await cardOrderToPay();

      await app.get(CardPaymentSweep).sweep();

      await expect(orderOf(orderId)).resolves.toMatchObject({
        status: 'PENDING_PAYMENT',
      });
    });

    it('cancels an order whose payment was never opened, once its hold is over', async () => {
      const { orderId } = await cardOrder();
      await prisma.order.update({
        where: { id: orderId },
        data: { createdAt: new Date(Date.now() - 3 * 60 * 60_000) },
      });

      const order = await sweepUntilSettled(orderId);

      expect(order.status).toBe('CANCELLED');
    });
  });
});
