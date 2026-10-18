import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type Redis from 'ioredis';
import {
  AppErrorCode,
  CartDto,
  CartTotalsDto,
  DeliveryDestinationType,
  DeliveryMethod,
  DeliveryQuoteDto,
  OrderDetailDto,
  PaymentMethod,
  PlaceOrderDeliveryDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { ClerkUsers } from '../src/auth';
import { ClerkJwtStrategy } from '../src/auth/clerk-jwt.strategy';
import { ArticlesTecDoc } from '../src/catalog';
import { DeliveryUnavailableException } from '../src/delivery/delivery.exceptions';
import { EcontTransport } from '../src/delivery/econt/econt.transport';
import { InventoryService } from '../src/inventory';
import { PrismaService } from '../src/prisma';
import { REDIS_CLIENT } from '../src/redis';

const RUN = `e2e-orders-${Date.now()}`;

const clerkJwtStrategy = {
  verifyToken: (token: string) =>
    token.startsWith('test:')
      ? Promise.resolve({ sub: token.slice('test:'.length) })
      : Promise.reject(new Error('invalid token')),
};

/** Customers filed with no phone, as a Google sign-in leaves them. */
const withoutPhone = new Set<string>();

const clerkUsers = {
  findIdentity: (clerkId: string) =>
    Promise.resolve({
      email: `${clerkId}@example.com`,
      firstName: 'Иван',
      lastName: 'Петров',
      unsafeMetadata: withoutPhone.has(clerkId)
        ? {}
        : { phoneNumber: '0888 123 456' },
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

/** Live gross price and pieces held, per article number. */
let stock: Record<string, { price: number; quantity: number }>;

function stockedFor(articleNumber: string) {
  const { price, quantity } = stock[articleNumber];

  return {
    available: quantity > 0,
    bestPriceExVat: null,
    bestPriceIncVat: price,
    availabilityByWarehouse: [
      {
        warehouseId: 'REGIONAL_2',
        quantity,
        deliveryWorkDays: 1,
        orderCutoffTime: '17:00',
        cutoffAt: '2026-10-19T14:00:00Z',
        pickup: { earliestAt: '2026-10-20T06:00:00Z', granularity: 'DAY' },
        courier: { earliestAt: '2026-10-20T06:00:00Z', granularity: 'DAY' },
      },
    ],
    computedAt: '2026-10-19T06:00:00Z',
  };
}

const inventory = {
  getAvailability: jest.fn(
    (identities: { brandId: string; articleNumber: string }[]) =>
      Promise.resolve(
        new Map(
          identities.map(({ brandId, articleNumber }) => [
            `${brandId}:${articleNumber}`,
            stockedFor(articleNumber),
          ]),
        ),
      ),
  ),
};

const SOFIA_ID = 41;
const DELIVERED_AT = new Date('2026-10-22T15:00:00Z').getTime();

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
          { officeCode: '1127', servingType: 'to_door_courier' },
          { officeCode: '1127', servingType: 'to_office_courier' },
        ],
      },
    ],
  },
  'Nomenclatures/AddressService.validateAddress': {
    validationStatus: 'normal',
    address: { street: 'бул. Витоша', num: '10', quarter: '', other: null },
  },
};

const DELIVERY_EUROS = 3.78;
const FEE_EUROS = 0.81;

const econt = {
  readNomenclature: jest.fn((service: string) =>
    Promise.resolve(NOMENCLATURES[service]),
  ),
  call: jest.fn(() =>
    Promise.resolve({
      label: {
        totalPrice: DELIVERY_EUROS + FEE_EUROS,
        currency: 'EUR',
        expectedDeliveryDate: DELIVERED_AT,
        services: [
          { type: 'C', price: DELIVERY_EUROS, currency: 'EUR' },
          { type: 'CD', price: FEE_EUROS, currency: 'EUR' },
        ],
      },
    }),
  ),
};

const TO_OFFICE: PlaceOrderDeliveryDto = {
  method: DeliveryMethod.COURIER_OFFICE,
  carrier: ShippingMethod.ECONT,
  officeCode: '1127',
};

const SOFIA_ADDRESS = {
  placeId: String(SOFIA_ID),
  street: 'бул. Витоша',
  streetNumber: '10',
  note: 'Звънец 3',
};

const TO_ADDRESS: PlaceOrderDeliveryDto = {
  method: DeliveryMethod.COURIER_ADDRESS,
  carrier: ShippingMethod.ECONT,
  address: SOFIA_ADDRESS,
};

const PICKUP: PlaceOrderDeliveryDto = { method: DeliveryMethod.STORE_PICKUP };

/** The worked example in docs/ORDERS.md → "Money": two discs and three pads. */
const GOODS = 2 * 1299 + 3 * 749;
const COURIER_TOTAL = GOODS + 378 + 81;

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerCount = 0;

  const server = () => app.getHttpServer();
  const auth = (clerkId: string) => `Bearer test:${clerkId}`;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(ClerkJwtStrategy).useValue(clerkJwtStrategy);
      builder.overrideProvider(ClerkUsers).useValue(clerkUsers);
      builder.overrideProvider(ArticlesTecDoc).useValue(articles);
      builder.overrideProvider(InventoryService).useValue(inventory);
      builder.overrideProvider(EcontTransport).useValue(econt);
    });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const customer = { clerkId: { startsWith: RUN } };

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
    stock = {
      DISC: { price: 1299, quantity: 10 },
      PAD: { price: 749, quantity: 10 },
      BULB: { price: 350, quantity: 10 },
    };
    econt.call.mockClear();
  });

  async function signUp(options: { hasPhone?: boolean } = {}) {
    const clerkId = `${RUN}-${++customerCount}`;

    if (options.hasPhone === false) {
      withoutPhone.add(clerkId);
    }

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
  ): Promise<CartDto> {
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
        thumbnailUrl: `https://images.example/${articleNumber}.jpg`,
        addedAtPriceIncVat: null,
      })
      .expect(201);

    return response.body as CartDto;
  }

  /** A customer with two discs and three pads in their cart. */
  async function customerWithCart() {
    const clerkId = await signUp();
    await addLine(clerkId, 'DISC', 2);
    const cart = await addLine(clerkId, 'PAD', 3);

    return { clerkId, cart };
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
        expectedTotalCents: COURIER_TOTAL,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        delivery: TO_OFFICE,
        ...overrides,
      });
  }

  const ordersOf = (cartId: string) =>
    prisma.order.findMany({ where: { cartId } });

  describe('placing an order', () => {
    it('places it to an office, freezing what the customer was shown', async () => {
      const { clerkId, cart } = await customerWithCart();

      const response = await placeOrder(clerkId, cart).expect(201);

      expect(response.body).toEqual({
        orderId: expect.any(String),
        orderReference: expect.stringMatching(/^VP-ORD-\d{6,}$/),
      });
      expect(response.headers['cache-control']).toBe('no-store');

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: response.body.orderId },
        include: { items: true, statusHistory: true },
      });
      expect(order).toMatchObject({
        cartId: cart.id,
        deliveryMethod: 'COURIER_OFFICE',
        carrier: 'ECONT',
        deliverySnapshot: {
          office: {
            code: '1127',
            name: 'София Център',
            address: 'София ул. Граф Игнатиев 1',
            weekdayHours: null,
            saturdayHours: null,
          },
        },
        parcelWeightGrams: 10000,
        goodsTotal: GOODS,
        deliveryPrice: 378,
        cashOnDeliveryFee: 81,
        total: 5304,
        vatAmount: 884,
        paymentMethod: 'CASH_ON_DELIVERY',
        contactFirstName: 'Иван',
        contactLastName: 'Петров',
        contactPhone: '+359888123456',
        contactEmail: `${clerkId}@example.com`,
        status: 'PROCESSING',
      });
      expect(order.expectedDeliveryDate?.toISOString()).toBe(
        '2026-10-22T00:00:00.000Z',
      );
      expect(order.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            brandId: '30',
            articleNumber: 'DISC',
            thumbnailUrl: 'https://images.example/DISC.jpg',
            quantity: 2,
            unitPrice: 1299,
            lineTotal: 2598,
          }),
          expect.objectContaining({
            articleNumber: 'PAD',
            quantity: 3,
            unitPrice: 749,
            lineTotal: 2247,
          }),
        ]),
      );
      expect(order.statusHistory).toEqual([
        expect.objectContaining({ status: 'PROCESSING', source: 'shop' }),
      ]);
    });

    it('retires the cart as the record of the order', async () => {
      const { clerkId, cart } = await customerWithCart();

      const { body } = await placeOrder(clerkId, cart).expect(201);

      expect(
        await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } }),
      ).toMatchObject({ status: 'ORDERED', orderId: body.orderId });
    });

    it('places it to an address, named by its place', async () => {
      const { clerkId, cart } = await customerWithCart();

      const { body } = await placeOrder(clerkId, cart, {
        delivery: TO_ADDRESS,
      }).expect(201);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: body.orderId },
      });
      expect(order.deliveryMethod).toBe('COURIER_ADDRESS');
      expect(order.deliverySnapshot).toEqual({
        address: { ...SOFIA_ADDRESS, city: 'София', postCode: '1000' },
      });
    });

    it('places a pickup at the price of the parts alone', async () => {
      const { clerkId, cart } = await customerWithCart();

      const { body } = await placeOrder(clerkId, cart, {
        delivery: PICKUP,
        expectedTotalCents: GOODS,
      }).expect(201);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: body.orderId },
      });
      expect(order).toMatchObject({
        deliveryMethod: 'STORE_PICKUP',
        carrier: null,
        deliveryPrice: 0,
        cashOnDeliveryFee: 0,
        total: GOODS,
        vatAmount: 807,
        parcelWeightGrams: null,
      });
      expect(econt.call).not.toHaveBeenCalled();
    });

    it('carries the unselected lines into a fresh cart', async () => {
      const { clerkId, cart } = await customerWithCart();
      await addLine(clerkId, 'BULB', 1);
      const deselected = await request(server())
        .patch('/cart/items/30/BULB')
        .set('Authorization', auth(clerkId))
        .send({ isSelected: false })
        .expect(200);

      await placeOrder(clerkId, deselected.body as CartDto).expect(201);

      const { body: next } = await request(server())
        .get('/cart')
        .set('Authorization', auth(clerkId))
        .expect(200);
      expect(next.id).not.toBe(cart.id);
      expect((next as CartDto).lines).toEqual([
        expect.objectContaining({ articleNumber: 'BULB', isSelected: false }),
      ]);
      const ordered = await prisma.orderItem.findMany({
        where: { order: { cartId: cart.id } },
      });
      expect(ordered.map(({ articleNumber }) => articleNumber).sort()).toEqual([
        'DISC',
        'PAD',
      ]);
    });

    it('leaves the customer with no cart when everything was ordered', async () => {
      const { clerkId, cart } = await customerWithCart();

      await placeOrder(clerkId, cart).expect(201);

      const { body } = await request(server())
        .get('/cart')
        .set('Authorization', auth(clerkId))
        .expect(200);
      expect(body).toEqual({ id: '', version: 0, lines: [] });
    });
  });

  describe('idempotency', () => {
    it('answers a retry of a placed order with the same order', async () => {
      const { clerkId, cart } = await customerWithCart();

      const first = await placeOrder(clerkId, cart).expect(201);
      const retry = await placeOrder(clerkId, cart).expect(200);

      expect(retry.body).toEqual(first.body);
      expect(await ordersOf(cart.id)).toHaveLength(1);
    });

    it('turns two concurrent requests for one cart into exactly one order', async () => {
      const { clerkId, cart } = await customerWithCart();

      const responses = await Promise.all([
        placeOrder(clerkId, cart),
        placeOrder(clerkId, cart),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(responses[0].body).toEqual(responses[1].body);
      expect(await ordersOf(cart.id)).toHaveLength(1);
    });
  });

  describe('refusals, which write nothing', () => {
    async function expectNothingWritten(cart: CartDto) {
      expect(await ordersOf(cart.id)).toHaveLength(0);
      expect(
        await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } }),
      ).toMatchObject({ status: 'ACTIVE', orderId: null });
    }

    it('refuses a total lower than the live one', async () => {
      const { clerkId, cart } = await customerWithCart();

      const response = await placeOrder(clerkId, cart, {
        expectedTotalCents: COURIER_TOTAL - 1,
      }).expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        errorCode: AppErrorCode.PRICE_CHANGED,
      });
      await expectNothingWritten(cart);
    });

    it('refuses when a price rose with no edit to the cart', async () => {
      const { clerkId, cart } = await customerWithCart();
      stock.DISC.price = 1349;

      const response = await placeOrder(clerkId, cart).expect(409);

      expect(response.body.errorCode).toBe(AppErrorCode.PRICE_CHANGED);
      await expectNothingWritten(cart);
    });

    it('answers 404 for another customer’s cart', async () => {
      const { cart } = await customerWithCart();
      const intruder = await signUp();

      const response = await placeOrder(intruder, cart).expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        errorCode: AppErrorCode.NOT_FOUND,
      });
      await expectNothingWritten(cart);
    });

    it('refuses a cart edited since the page priced it', async () => {
      const { clerkId, cart } = await customerWithCart();

      const response = await placeOrder(clerkId, cart, {
        cartVersion: cart.version - 1,
      }).expect(409);

      expect(response.body.errorCode).toBe(AppErrorCode.CART_STALE);
      await expectNothingWritten(cart);
    });

    it('refuses a part the stock no longer covers', async () => {
      const { clerkId, cart } = await customerWithCart();
      stock.PAD.quantity = 2;

      const response = await placeOrder(clerkId, cart).expect(422);

      expect(response.body.errorCode).toBe(AppErrorCode.ARTICLE_UNAVAILABLE);
      await expectNothingWritten(cart);
    });

    it('refuses, with no flat rate, when Econt cannot be reached', async () => {
      const { clerkId, cart } = await customerWithCart();
      econt.call.mockRejectedValueOnce(new DeliveryUnavailableException());

      const response = await placeOrder(clerkId, cart).expect(503);

      expect(response.body.errorCode).toBe(AppErrorCode.DELIVERY_UNAVAILABLE);
      await expectNothingWritten(cart);
    });

    it('refuses a customer whose profile lacks a phone', async () => {
      const clerkId = await signUp({ hasPhone: false });
      const cart = await addLine(clerkId, 'DISC', 1);

      const response = await placeOrder(clerkId, cart).expect(422);

      expect(response.body.errorCode).toBe(
        AppErrorCode.CUSTOMER_DETAILS_REQUIRED,
      );
      await expectNothingWritten(cart);
    });

    it('refuses card, which is not offered yet', async () => {
      const { clerkId, cart } = await customerWithCart();

      const response = await placeOrder(clerkId, cart, {
        paymentMethod: PaymentMethod.CARD,
      }).expect(400);

      expect(response.body.errorCode).toBe(AppErrorCode.VALIDATION_ERROR);
    });

    it('refuses a visitor who is not signed in', async () => {
      const { cart } = await customerWithCart();

      await request(server())
        .post('/orders')
        .send({
          cartId: cart.id,
          cartVersion: cart.version,
          expectedTotalCents: COURIER_TOTAL,
          paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
          delivery: TO_OFFICE,
        })
        .expect(401);
    });
  });

  describe('rate limit', () => {
    // Retries of one order are cheap here: every one after the first is a
    // replay, answered without pricing anything.
    it('allows five a minute, counted per customer rather than per address', async () => {
      const first = await customerWithCart();
      const second = await customerWithCart();

      await placeOrder(first.clerkId, first.cart).expect(201);
      for (let attempt = 2; attempt <= 5; attempt++) {
        await placeOrder(first.clerkId, first.cart).expect(200);
      }

      const refused = await placeOrder(first.clerkId, first.cart).expect(429);
      expect(refused.body.errorCode).toBe(AppErrorCode.RATE_LIMITED);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);

      await placeOrder(second.clerkId, second.cart).expect(201);
    });

    it('counts a request with a bad token against the address before refusing it', async () => {
      const response = await request(server())
        .post('/orders')
        .set('Authorization', 'Bearer not-a-token')
        .send({})
        .expect(401);

      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });

  describe('reading an order back', () => {
    it('answers the owner with the order as it was placed', async () => {
      const { clerkId, cart } = await customerWithCart();
      const { body: placed } = await placeOrder(clerkId, cart, {
        delivery: TO_ADDRESS,
      }).expect(201);

      const response = await request(server())
        .get(`/orders/${placed.orderReference}`)
        .set('Authorization', auth(clerkId))
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      const order = response.body as OrderDetailDto;
      expect(order).toMatchObject({
        orderId: placed.orderId,
        orderReference: placed.orderReference,
        status: 'PROCESSING',
        goodsTotal: GOODS,
        deliveryPrice: 378,
        cashOnDeliveryFee: 81,
        total: 5304,
        netAmount: 4420,
        vatAmount: 884,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        delivery: {
          method: DeliveryMethod.COURIER_ADDRESS,
          carrier: ShippingMethod.ECONT,
          address: { ...SOFIA_ADDRESS, city: 'София', postCode: '1000' },
          expectedDeliveryDate: '2026-10-22',
        },
        contact: { phoneNumber: '+359888123456' },
      });
      expect(order.items).toHaveLength(2);
      expect(order.statusHistory).toEqual([
        { status: 'PROCESSING', occurredAt: expect.any(String) },
      ]);
    });

    it('answers anyone else as though there were no such order', async () => {
      const { clerkId, cart } = await customerWithCart();
      const { body: placed } = await placeOrder(clerkId, cart).expect(201);
      const stranger = await signUp();

      const response = await request(server())
        .get(`/orders/${placed.orderReference}`)
        .set('Authorization', auth(stranger))
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        errorCode: AppErrorCode.ORDER_NOT_FOUND,
      });
    });

    it('refuses a visitor who is not signed in', async () => {
      await request(server()).get('/orders/VP-ORD-000001').expect(401);
    });

    it('refuses an order id where the reference belongs', async () => {
      const { clerkId, cart } = await customerWithCart();
      const { body: placed } = await placeOrder(clerkId, cart).expect(201);

      const response = await request(server())
        .get(`/orders/${placed.orderId}`)
        .set('Authorization', auth(clerkId))
        .expect(400);

      expect(response.body).toEqual({
        statusCode: 400,
        errorCode: AppErrorCode.VALIDATION_ERROR,
      });
    });
  });

  describe('one figure everywhere', () => {
    it('totals the cart, quotes the delivery and places the order at the same money', async () => {
      const { clerkId, cart } = await customerWithCart();

      const { body: totals } = await request(server())
        .get('/checkout/totals')
        .set('Authorization', auth(clerkId))
        .expect(200);
      const { body: quote } = await request(server())
        .post('/checkout/quote')
        .set('Authorization', auth(clerkId))
        .send({
          carrier: ShippingMethod.ECONT,
          destination: {
            type: DeliveryDestinationType.OFFICE,
            officeCode: '1127',
          },
          isCashOnDelivery: true,
        })
        .expect(200);
      const { body: placed } = await placeOrder(clerkId, cart, {
        expectedTotalCents: (quote as DeliveryQuoteDto).money?.total,
      }).expect(201);
      const { body: order } = await request(server())
        .get(`/orders/${placed.orderReference}`)
        .set('Authorization', auth(clerkId))
        .expect(200);

      expect(totals as CartTotalsDto).toEqual({
        cartVersion: cart.version,
        goodsTotal: GOODS,
        netAmount: 4038,
        vatAmount: 807,
        total: GOODS,
      });
      expect((quote as DeliveryQuoteDto).money).toEqual({
        goodsTotal: GOODS,
        deliveryPrice: 378,
        cashOnDeliveryFee: 81,
        total: 5304,
        netAmount: 4420,
        vatAmount: 884,
      });
      expect(order).toMatchObject((quote as DeliveryQuoteDto).money ?? {});
    });

    it('never caches the cart totals', async () => {
      const { clerkId } = await customerWithCart();

      const response = await request(server())
        .get('/checkout/totals')
        .set('Authorization', auth(clerkId))
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });
  });
});
