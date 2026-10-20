import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import request from 'supertest';
import type Redis from 'ioredis';
import {
  AppErrorCode,
  CART_TOKEN_HEADER,
  CartDto,
  DeliveryMethod,
  PaymentMethod,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
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
import { PrismaService } from '../src/prisma';
import { REDIS_CLIENT } from '../src/redis';

const RUN = `e2e-quick-orders-${Date.now()}`;

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

const PRICES: Record<string, number> = { DISC: 1299, PAD: 749, BULB: 350 };

let priceOf: Record<string, number>;

const inventory = {
  getAvailability: (identities: { brandId: string; articleNumber: string }[]) =>
    Promise.resolve(
      new Map(
        identities.map(({ brandId, articleNumber }) => [
          `${brandId}:${articleNumber}`,
          {
            available: true,
            bestPriceExVat: null,
            bestPriceIncVat: priceOf[articleNumber],
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
};

const econt = {
  readNomenclature: (service: string) =>
    Promise.resolve(NOMENCLATURES[service]),
  call: () =>
    Promise.resolve({
      label: {
        totalPrice: 3.78 + 0.81,
        currency: 'EUR',
        expectedDeliveryDate: new Date('2026-10-22T15:00:00Z').getTime(),
        services: [
          { type: 'C', price: 3.78, currency: 'EUR' },
          { type: 'CD', price: 0.81, currency: 'EUR' },
        ],
      },
    }),
};

/** Two discs and three pads to an Econt office, as in docs/ORDERS.md → "Money". */
const COURIER_TOTAL = 2 * 1299 + 3 * 749 + 378 + 81;

/** One mobile number per call, so no case inherits another's orders awaiting a call. */
let phoneCount = 0;
const PHONE_SEED = Date.now() % 1_000_000;

function nextPhone(): string {
  const subscriber = (PHONE_SEED + ++phoneCount) % 1_000_000;

  return `+359888${String(subscriber).padStart(6, '0')}`;
}

describe('Quick orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mintedTokens: string[] = [];
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(ClerkJwtStrategy).useValue(clerkJwtStrategy);
      builder.overrideProvider(ClerkUsers).useValue(clerkUsers);
      builder.overrideProvider(ArticlesTecDoc).useValue(articles);
      builder.overrideProvider(InventoryService).useValue(inventory);
      builder.overrideProvider(EcontTransport).useValue(econt);
    });
    prisma = app.get(PrismaService);
    app.get(SchedulerRegistry).deleteInterval(OUTBOX_RELAY_INTERVAL);
  });

  afterAll(async () => {
    const guestCarts = {
      OR: [
        { token: { in: mintedTokens } },
        { releasedToken: { in: mintedTokens } },
      ],
    };
    const customer = { clerkId: { startsWith: RUN } };
    const ownedCarts = { OR: [guestCarts, { customer }] };
    const orders = await prisma.order.findMany({
      where: { cart: ownedCarts },
      select: { id: true },
    });
    const orderIds = orders.map(({ id }) => id);

    await prisma.outboxEvent.deleteMany({
      where: { OR: orderIds.map(orderPlacedFilter) },
    });
    await prisma.cart.updateMany({
      where: ownedCarts,
      data: { orderId: null },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.orderStatusHistory.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cart.deleteMany({ where: ownedCarts });
    await prisma.customer.deleteMany({ where: customer });
    await app.close();
  });

  beforeEach(async () => {
    resetRateLimits(app);
    await app.get<Redis>(REDIS_CLIENT).flushall();
    priceOf = { ...PRICES };
  });

  function addLine(token: string | null, articleNumber: string, quantity = 1) {
    const call = request(server()).post('/cart/items');

    if (token) {
      call.set(CART_TOKEN_HEADER, token);
    }

    return call
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
  }

  /** A guest with two discs and three pads in the cart their token holds. */
  async function guestWithCart() {
    const opened = await addLine(null, 'DISC', 2);
    const token = opened.headers[CART_TOKEN_HEADER];
    mintedTokens.push(token);
    const { body } = await addLine(token, 'PAD', 3);

    return { token, cart: body as CartDto };
  }

  function contact(overrides: Record<string, unknown> = {}) {
    return {
      firstName: 'Мария',
      lastName: 'Иванова',
      phoneNumber: nextPhone(),
      ...overrides,
    };
  }

  function placeQuickOrder(
    token: string | null,
    cart: CartDto,
    overrides: Record<string, unknown> = {},
  ) {
    const call = request(server()).post('/orders/quick');

    if (token) {
      call.set(CART_TOKEN_HEADER, token);
    }

    return call.send({
      cartId: cart.id,
      cartVersion: cart.version,
      expectedTotalCents: COURIER_TOTAL,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      delivery: {
        method: DeliveryMethod.COURIER_OFFICE,
        carrier: ShippingMethod.ECONT,
        officeCode: '1127',
      },
      contact: contact(),
      ...overrides,
    });
  }

  const ordersOf = (cartId: string) =>
    prisma.order.findMany({ where: { cartId } });

  function orderPlacedFilter(orderId: string) {
    return {
      type: 'OrderPlaced',
      payload: { path: ['orderId'], equals: orderId },
    };
  }

  async function expectNothingWritten(cart: CartDto) {
    expect(await ordersOf(cart.id)).toHaveLength(0);
    expect(
      await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } }),
    ).toMatchObject({ status: 'ACTIVE', orderId: null });
  }

  describe('placing one', () => {
    it('orders the guest’s cart with no customer, waiting on a confirmation call', async () => {
      const { token, cart } = await guestWithCart();
      const phone = nextPhone();

      const response = await placeQuickOrder(token, cart, {
        contact: contact({ phoneNumber: phone.replace('+359', '0') }),
      }).expect(201);

      expect(response.body).toEqual({
        orderId: expect.any(String),
        orderReference: expect.stringMatching(/^VP-ORD-\d{6,}$/),
      });
      expect(response.headers['cache-control']).toBe('no-store');
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: response.body.orderId },
        include: { statusHistory: true },
      });
      expect(order).toMatchObject({
        customerId: null,
        cartId: cart.id,
        total: COURIER_TOTAL,
        contactFirstName: 'Мария',
        contactLastName: 'Иванова',
        contactPhone: phone,
        contactEmail: null,
        status: 'AWAITING_CONFIRMATION',
      });
      expect(order.statusHistory).toEqual([
        expect.objectContaining({
          status: 'AWAITING_CONFIRMATION',
          source: 'shop',
        }),
      ]);
    });

    it('keeps the email the guest gave', async () => {
      const { token, cart } = await guestWithCart();

      const { body } = await placeQuickOrder(token, cart, {
        contact: contact({ email: 'maria@example.com' }),
      }).expect(201);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: body.orderId },
      });
      expect(order.contactEmail).toBe('maria@example.com');
    });

    it('retires the cart, releasing its token', async () => {
      const { token, cart } = await guestWithCart();

      const { body } = await placeQuickOrder(token, cart).expect(201);

      expect(
        await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } }),
      ).toMatchObject({
        status: 'ORDERED',
        orderId: body.orderId,
        token: null,
        releasedToken: token,
      });
      const { body: next } = await request(server())
        .get('/cart')
        .set(CART_TOKEN_HEADER, token)
        .expect(200);
      expect(next).toEqual({ id: '', version: 0, lines: [] });
    });

    it('hands the token to a cart keeping the unselected lines', async () => {
      const { token } = await guestWithCart();
      await addLine(token, 'BULB');
      const { body: cart } = await request(server())
        .patch('/cart/items/30/BULB')
        .set(CART_TOKEN_HEADER, token)
        .send({ isSelected: false })
        .expect(200);

      await placeQuickOrder(token, cart as CartDto).expect(201);

      const { body: next } = await request(server())
        .get('/cart')
        .set(CART_TOKEN_HEADER, token)
        .expect(200);
      expect(next.id).not.toBe((cart as CartDto).id);
      expect((next as CartDto).lines).toEqual([
        expect.objectContaining({ articleNumber: 'BULB', isSelected: false }),
      ]);
    });
  });

  describe('idempotency', () => {
    it('answers a retry with the same order', async () => {
      const { token, cart } = await guestWithCart();
      const body = { contact: contact() };

      const first = await placeQuickOrder(token, cart, body).expect(201);
      const retry = await placeQuickOrder(token, cart, body).expect(200);

      expect(retry.body).toEqual(first.body);
      expect(await ordersOf(cart.id)).toHaveLength(1);
    });

    it('answers a retry after the token moved to the next cart', async () => {
      const { token } = await guestWithCart();
      await addLine(token, 'BULB');
      const { body: cart } = await request(server())
        .patch('/cart/items/30/BULB')
        .set(CART_TOKEN_HEADER, token)
        .send({ isSelected: false })
        .expect(200);
      const body = { contact: contact() };

      const first = await placeQuickOrder(token, cart, body).expect(201);
      const retry = await placeQuickOrder(token, cart, body).expect(200);

      expect(retry.body).toEqual(first.body);
    });

    it('turns two concurrent requests for one cart into exactly one order', async () => {
      const { token, cart } = await guestWithCart();
      const body = { contact: contact() };

      const responses = await Promise.all([
        placeQuickOrder(token, cart, body),
        placeQuickOrder(token, cart, body),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(await ordersOf(cart.id)).toHaveLength(1);
    });
  });

  describe('after the commit: the outbox', () => {
    async function relayOrderPlaced(orderId: string) {
      const [event] = await prisma.outboxEvent.findMany({
        where: orderPlacedFilter(orderId),
      });
      expect(event).toBeDefined();

      for (let tick = 0; tick < 20; tick++) {
        await app.get(OutboxRelay).relayDue();

        if (
          (await prisma.outboxEvent.count({
            where: orderPlacedFilter(orderId),
          })) === 0
        ) {
          return event;
        }
      }

      throw new Error(`OrderPlaced for ${orderId} was never delivered`);
    }

    it('tells the office to call, writes nothing to the guest yet, and publishes OrderPlaced', async () => {
      const { token, cart } = await guestWithCart();
      const { body } = await placeQuickOrder(token, cart, {
        contact: contact({ email: 'maria@example.com' }),
      }).expect(201);

      const event = await relayOrderPlaced(body.orderId);

      const emails = app
        .get<RecordingEmailSender>(EmailSender)
        .sent.filter(({ idempotencyKey }) =>
          idempotencyKey.startsWith(event.id),
        );
      expect(emails).toEqual([
        {
          idempotencyKey: `${event.id}:office-notification-email`,
          email: expect.objectContaining({
            to: app.get(ConfigService).get('ORDERS_NOTIFY_EMAIL'),
            replyTo: 'maria@example.com',
            subject: expect.stringMatching(
              new RegExp(
                `^За потвърждение: Нова поръчка ${body.orderReference}`,
              ),
            ),
          }),
        },
      ]);
      expect(
        app
          .get<RecordingSqsPublisher>(SqsPublisher)
          .published.filter(({ event: sent }) => sent.eventId === event.id),
      ).toEqual([
        {
          event: expect.objectContaining({ type: 'OrderPlaced' }),
          fields: { orderId: body.orderId },
        },
      ]);
    });
  });

  describe('refusals, which write nothing', () => {
    it('answers 404 to a request holding no cart token', async () => {
      const { cart } = await guestWithCart();

      const response = await placeQuickOrder(null, cart).expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        errorCode: AppErrorCode.NOT_FOUND,
      });
      await expectNothingWritten(cart);
    });

    it('answers 404 for another guest’s cart', async () => {
      const { cart } = await guestWithCart();
      const intruder = await guestWithCart();

      await placeQuickOrder(intruder.token, cart).expect(404);

      await expectNothingWritten(cart);
    });

    it('answers 404 for a signed-in customer’s cart, which no token holds', async () => {
      const auth = `Bearer test:${RUN}-customer`;
      await request(server())
        .post('/customers/me')
        .set('Authorization', auth)
        .expect(201);
      const { body: cart } = await request(server())
        .post('/cart/items')
        .set('Authorization', auth)
        .send({
          brandId: '30',
          articleNumber: 'DISC',
          quantity: 1,
          brandName: 'BOSCH',
          brandLogoUrl: null,
          description: 'Част DISC',
          thumbnailUrl: null,
          addedAtPriceIncVat: null,
        })
        .expect(201);
      const { token } = await guestWithCart();

      await request(server())
        .post('/orders/quick')
        .set('Authorization', auth)
        .set(CART_TOKEN_HEADER, token)
        .send({
          cartId: (cart as CartDto).id,
          cartVersion: (cart as CartDto).version,
          expectedTotalCents: 1299 + 378 + 81,
          paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
          delivery: {
            method: DeliveryMethod.COURIER_OFFICE,
            carrier: ShippingMethod.ECONT,
            officeCode: '1127',
          },
          contact: contact(),
        })
        .expect(404);

      await expectNothingWritten(cart as CartDto);
    });

    it('refuses a total that is not the live one', async () => {
      const { token, cart } = await guestWithCart();
      priceOf.DISC = 1349;

      const response = await placeQuickOrder(token, cart).expect(409);

      expect(response.body.errorCode).toBe(AppErrorCode.PRICE_CHANGED);
      await expectNothingWritten(cart);
    });

    it('refuses a phone that is not a Bulgarian mobile', async () => {
      const { token, cart } = await guestWithCart();

      const response = await placeQuickOrder(token, cart, {
        contact: contact({ phoneNumber: '02 987 6543' }),
      }).expect(400);

      expect(response.body.errorCode).toBe(AppErrorCode.VALIDATION_ERROR);
      await expectNothingWritten(cart);
    });
  });

  describe('limits', () => {
    it('allows three attempts an hour per phone, then says when to retry', async () => {
      const { token, cart } = await guestWithCart();
      const body = { contact: contact() };

      await placeQuickOrder(token, cart, body).expect(201);
      await placeQuickOrder(token, cart, body).expect(200);
      await placeQuickOrder(token, cart, body).expect(200);

      const refused = await placeQuickOrder(token, cart, body).expect(429);
      expect(refused.body.errorCode).toBe(AppErrorCode.RATE_LIMITED);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);

      const other = await guestWithCart();
      await placeQuickOrder(other.token, other.cart).expect(201);
    });

    it('allows five attempts per address in ten minutes, whatever the phone', async () => {
      const { cart } = await guestWithCart();

      for (let attempt = 1; attempt <= 5; attempt++) {
        await placeQuickOrder(null, cart).expect(404);
      }

      const refused = await placeQuickOrder(null, cart).expect(429);
      expect(refused.body.errorCode).toBe(AppErrorCode.RATE_LIMITED);
    });

    it('refuses a fourth order waiting on a call to one phone', async () => {
      const phoneNumber = nextPhone();
      const body = { contact: contact({ phoneNumber }) };

      for (let order = 1; order <= 3; order++) {
        const { token, cart } = await guestWithCart();
        await placeQuickOrder(token, cart, body).expect(201);
      }
      resetRateLimits(app);
      const { token, cart } = await guestWithCart();

      const refused = await placeQuickOrder(token, cart, body).expect(429);

      expect(refused.body.errorCode).toBe(AppErrorCode.RATE_LIMITED);
      await expectNothingWritten(cart);
    });
  });
});
