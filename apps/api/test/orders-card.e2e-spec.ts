import { INestApplication } from '@nestjs/common';
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
import { ClerkUsers } from '../src/auth';
import { ClerkJwtStrategy } from '../src/auth/clerk-jwt.strategy';
import { ArticlesTecDoc } from '../src/catalog';
import { EcontTransport } from '../src/delivery/econt/econt.transport';
import { InventoryService } from '../src/inventory';
import { MAX_PAYMENT_ATTEMPTS } from '../src/orders/card-payment/card-payment.service';
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
});
